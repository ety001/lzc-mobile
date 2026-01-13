package sms

import (
	"fmt"
	"log"
	"time"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/notify"
)

// Handler 短信处理器
type Handler struct {
	notifyManager *notify.Manager
}

// NewHandler 创建短信处理器
func NewHandler() *Handler {
	nm := notify.NewManager()
	if err := nm.LoadConfigs(); err != nil {
		log.Printf("Warning: Failed to load notification configs: %v", err)
	}

	return &Handler{
		notifyManager: nm,
	}
}

// OnSMSReceived 处理收到的短信
// 推送消息到所有启用的通知渠道，并保存到数据库
func (h *Handler) OnSMSReceived(device, number, message string) {
	log.Printf("SMS received from %s on device %s: %s", number, device, message)

	// 格式化通知消息
	notificationMessage := fmt.Sprintf("SMS from %s (device: %s):\n%s", number, device, message)

	// 获取所有启用的通知渠道
	var enabledConfigs []database.NotificationConfig
	if err := database.DB.Where("enabled = ?", true).Find(&enabledConfigs).Error; err != nil {
		log.Printf("Error loading notification configs: %v", err)
		// 即使加载配置失败，也继续保存到数据库
	} else {
		// 提取渠道列表
		channels := make([]database.NotificationChannel, 0, len(enabledConfigs))
		for _, config := range enabledConfigs {
			channels = append(channels, config.Channel)
		}

		// 发送通知到所有启用的渠道
		if len(channels) > 0 {
			errors := h.notifyManager.SendToChannels(channels, notificationMessage)
			if len(errors) > 0 {
				log.Printf("Some notifications failed: %v", errors)
			} else {
				log.Println("SMS notification sent successfully")
			}
		} else {
			log.Println("No notification channels enabled")
		}
	}

	// 保存到数据库，标记为已推送，方向为 inbound（接收）
	now := time.Now()
	smsMessage := database.SMSMessage{
		DongleID:    device,
		PhoneNumber: number,
		Content:     message,
		Direction:   "inbound",
		Pushed:      true,
		PushedAt:    &now,
	}

	if err := database.DB.Create(&smsMessage).Error; err != nil {
		log.Printf("Error saving SMS message to database: %v", err)
		return
	}

	log.Printf("SMS message saved to database with ID %d", smsMessage.ID)
}

// OnStatusUpdate 状态更新（实现 StatusSubscriber 接口）
func (h *Handler) OnStatusUpdate(info *ami.StatusInfo) {
	// 短信处理器不需要处理状态更新
}

// Register 注册到 AMI 管理器
func (h *Handler) Register() {
	amiManager := ami.GetManager()
	amiManager.Subscribe(h)
	log.Println("SMS handler registered to AMI manager")
}

// ReloadConfigs 重新加载通知配置
func (h *Handler) ReloadConfigs() {
	if err := h.notifyManager.LoadConfigs(); err != nil {
		log.Printf("Error reloading notification configs: %v", err)
	} else {
		log.Println("Notification configs reloaded")
	}
}
