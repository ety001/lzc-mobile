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
func (h *Handler) OnSMSReceived(device, number, message, timestamp string) {
	log.Printf("SMS received from %s on device %s: %s (timestamp: %s)", number, device, message, timestamp)

	// 检查是否已存在相同的短信（使用 SIM 卡时间戳、号码和内容）
	var existingMessage database.SMSMessage
	err := database.DB.Where(
		"dongle_id = ? AND phone_number = ? AND content = ?",
		device, number, message,
	).Order("created_at DESC").First(&existingMessage).Error

	if err == nil {
		// 找到相同的短信，检查时间戳是否相同
		if existingMessage.SMSTimestamp != nil && timestamp != "" {
			// 将数据库中的时间戳转换为字符串进行比较
			dbTimestamp := existingMessage.SMSTimestamp.Format("06/01/02 15:04:05")
			if dbTimestamp == timestamp {
				// 时间戳也相同，确认为重复短信
				log.Printf("Duplicate SMS detected (ID %d), skipping notification", existingMessage.ID)
				return
			}
			// 时间戳不同，可能是不同时间收到的相同内容短信，继续处理
		} else {
			// 没有时间戳信息，使用内容判断
			// 检查是否在最近 1 小时内创建
			oneHourAgo := time.Now().Add(-1 * time.Hour)
			if existingMessage.CreatedAt.After(oneHourAgo) {
				log.Printf("Duplicate SMS detected (ID %d) within 1 hour, skipping notification", existingMessage.ID)
				return
			}
		}
	}

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

	// 解析 SIM 卡时间戳
	var smsTime time.Time
	if timestamp != "" {
		// SIM 卡时间戳格式: "YY/MM/DD HH:MM:SS"
		// 例如: "25/01/21 14:30:00"
		smsTime, err = time.Parse("06/01/02 15:04:05", timestamp)
		if err != nil {
			log.Printf("Error parsing SMS timestamp '%s': %v, using current time", timestamp, err)
			smsTime = time.Now()
		}
		// 转换为 2000 年代
		smsTime = smsTime.AddDate(2000, 0, 0)
	} else {
		smsTime = time.Now()
	}

	// 保存到数据库，使用 SIM 卡时间戳，标记为已推送，方向为 inbound（接收）
	now := time.Now()
	smsMessage := database.SMSMessage{
		DongleID:     device,
		PhoneNumber:  number,
		Content:      message,
		Direction:    "inbound",
		SMSTimestamp: &smsTime,
		Pushed:       true,
		PushedAt:     &now,
	}

	if err := database.DB.Create(&smsMessage).Error; err != nil {
		log.Printf("Error saving SMS message to database: %v", err)
		return
	}

	log.Printf("SMS message saved to database with ID %d (SIM timestamp: %s)", smsMessage.ID, smsTime.Format("2006-01-02 15:04:05"))
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
