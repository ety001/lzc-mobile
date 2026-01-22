package sms

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/notify"
)

// smsRequest 短信处理请求
type smsRequest struct {
	device    string
	number    string
	message   string
	timestamp string
	smsIndex  int // SIM 卡短信索引
}

// Handler 短信处理器
type Handler struct {
	notifyManager *notify.Manager
	startupTime   time.Time
	mu            sync.RWMutex
	smsQueue      chan smsRequest // 带缓冲的短信处理队列
	wg            sync.WaitGroup  // 等待处理完成
	processedSMS  map[string]bool // 已处理的短信索引 (device:index -> true)
}

// NewHandler 创建短信处理器
func NewHandler() *Handler {
	nm := notify.NewManager()
	if err := nm.LoadConfigs(); err != nil {
		log.Printf("Warning: Failed to load notification configs: %v", err)
	}

	h := &Handler{
		notifyManager: nm,
		startupTime:   time.Now(),
		smsQueue:      make(chan smsRequest, 100), // 容量100，足够容纳SIM卡所有短信
		processedSMS:  make(map[string]bool),
	}

	// 启动串行处理 goroutine
	h.wg.Add(1)
	go h.processSMSQueue()

	log.Println("SMS handler initialized with serial processing queue")

	return h
}

// OnSMSReceived 处理收到的短信（AMI 事件入口）
// 推送消息到所有启用的通知渠道，并保存到数据库
func (h *Handler) OnSMSReceived(device, number, message, timestamp string) {
	// 如果没有索引，使用 0（旧版本兼容）
	h.OnSMSReceivedWithIndex(device, number, message, timestamp, 0)
}

// OnSMSReceivedWithIndex 处理收到的短信（带索引）
func (h *Handler) OnSMSReceivedWithIndex(device, number, message, timestamp string, smsIndex int) {
	// 非阻塞地放入队列
	req := smsRequest{
		device:    device,
		number:    number,
		message:   message,
		timestamp: timestamp,
		smsIndex:  smsIndex,
	}

	select {
	case h.smsQueue <- req:
		log.Printf("SMS queued for processing (device=%s, index=%d, queue size: %d)", device, smsIndex, len(h.smsQueue))
	default:
		log.Printf("SMS queue full, SMS will remain on SIM card for later processing")
		// 队列满时，短信仍在SIM卡中，可以稍后通过其他方式处理
	}
}

// processSMSQueue 串行处理短信队列
func (h *Handler) processSMSQueue() {
	defer h.wg.Done()

	for req := range h.smsQueue {
		log.Printf("Processing SMS from %s on device %s", req.number, req.device)
		h.processSMS(req)
		log.Printf("Finished processing SMS from %s", req.number)
	}
}

// processSMS 处理单条短信（保存→推送→标记已处理）
func (h *Handler) processSMS(req smsRequest) {
	device := req.device
	number := req.number
	message := req.message
	timestamp := req.timestamp
	smsIndex := req.smsIndex

	log.Printf("Processing SMS from %s on device %s (index=%d): %s (timestamp: %s)", number, device, smsIndex, message, timestamp)

	// 步骤1：解析 SIM 卡时间戳
	var smsTime time.Time
	var err error
	if timestamp != "" {
		// SIM 卡时间戳格式: "YY/MM/DD HH:MM:SS"
		smsTime, err = time.Parse("06/01/02 15:04:05", timestamp)
		if err != nil {
			log.Printf("Error parsing SMS timestamp '%s': %v, using current time", timestamp, err)
			smsTime = time.Now()
		} else {
			// 转换为 2000 年代
			smsTime = smsTime.AddDate(2000, 0, 0)
		}
	} else {
		smsTime = time.Now()
	}

	log.Printf("New SMS detected, saving to database")

	// 步骤2：保存到数据库（pushed=false，还没推送通知）
	smsMessage := database.SMSMessage{
		DongleID:     device,
		PhoneNumber:  number,
		Content:      message,
		Direction:    "inbound",
		SMSIndex:     smsIndex,
		SMSTimestamp: &smsTime,
		Pushed:       false, // 先标记为未推送
	}

	if err := database.DB.Create(&smsMessage).Error; err != nil {
		log.Printf("Error saving SMS message to database: %v", err)
		return
	}

	log.Printf("SMS message saved to database with ID %d (index=%d, SIM timestamp: %s)", smsMessage.ID, smsIndex, smsTime.Format("2006-01-02 15:04:05"))

	// 注意：如果配置了 autodeletesms=yes，quectel 模块会自动删除短信

	// 步骤3：发送通知
	log.Printf("Sending notifications for SMS ID %d", smsMessage.ID)
	notificationMessage := fmt.Sprintf("SMS from %s (device: %s):\n%s", number, device, message)

	// 获取所有启用的通知渠道
	var enabledConfigs []database.NotificationConfig
	if err := database.DB.Where("enabled = ?", true).Find(&enabledConfigs).Error; err != nil {
		log.Printf("Error loading notification configs: %v", err)
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

	// 步骤4：更新数据库标记为已推送
	now := time.Now()
	if err := database.DB.Model(&smsMessage).Updates(map[string]interface{}{
		"pushed":    true,
		"pushed_at": now,
	}).Error; err != nil {
		log.Printf("Error updating SMS message as pushed: %v", err)
	} else {
		log.Printf("SMS message ID %d marked as pushed", smsMessage.ID)
	}
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

	// 启动时查询 SIM 卡上的短信，标记已处理的短信
	go h.initProcessedSMS()
}

// initProcessedSMS 初始化已处理的短信列表
// 查询 SIM 卡上的短信，检查当前状态
func (h *Handler) initProcessedSMS() {
	// 等待 AMI 连接就绪
	amiManager := ami.GetManager()
	maxRetries := 10
	retryInterval := 2 * time.Second

	var client *ami.Client
	for i := 0; i < maxRetries; i++ {
		client = amiManager.GetClient()
		if client != nil {
			break
		}
		if i < maxRetries-1 {
			log.Printf("Waiting for AMI client to be ready (attempt %d/%d)...", i+1, maxRetries)
			time.Sleep(retryInterval)
		}
	}

	if client == nil {
		log.Printf("Warning: AMI client not available, cannot check SIM card SMS")
		return
	}

	// 查询 SIM 卡上的短信，检查当前状态
	h.checkSIMCardSMS(client)
}

// checkSIMCardSMS 检查 SIM 卡上的短信状态
func (h *Handler) checkSIMCardSMS(client *ami.Client) {
	// 获取所有 dongle 设备
	var dongles []database.Dongle
	if err := database.DB.Where("disable = ?", false).Find(&dongles).Error; err != nil {
		log.Printf("Error querying dongles: %v", err)
		return
	}

	for _, dongle := range dongles {
		log.Printf("Checking SMS on device %s...", dongle.DeviceID)

		// 查询 SIM 卡上的短信
		smsList, err := client.ListSMS(dongle.DeviceID)
		if err != nil {
			log.Printf("Error listing SMS from device %s: %v", dongle.DeviceID, err)
			continue
		}

		if len(smsList) == 0 {
			log.Printf("No SMS found on device %s", dongle.DeviceID)
			continue
		}

		log.Printf("Found %d SMS on device %s", len(smsList), dongle.DeviceID)

		// 记录每条短信的信息
		for _, sms := range smsList {
			log.Printf("SMS on device %s: index=%d, sender=%s, timestamp=%s, content=%q",
				dongle.DeviceID, sms.Index, sms.Sender, sms.Timestamp, sms.Content)
		}
	}
}

// ReloadConfigs 重新加载通知配置
func (h *Handler) ReloadConfigs() {
	if err := h.notifyManager.LoadConfigs(); err != nil {
		log.Printf("Error reloading notification configs: %v", err)
	} else {
		log.Println("Notification configs reloaded")
	}
}
