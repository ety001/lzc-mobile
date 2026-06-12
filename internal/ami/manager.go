package ami

import (
	"encoding/base64"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/staskobzar/goami2"
)

// DongleAlertFunc 当 dongle 设备异常时调用的通知回调
type DongleAlertFunc func(deviceID, message string)

// Manager AMI 管理器（单例）
type Manager struct {
	client          *Client
	subscribers     []StatusSubscriber
	statusFailCount int // 状态查询连续失败次数，用于检测 AMI 连接断开
	mu              sync.RWMutex

	// dongle 设备健康检查相关
	dongleAlertFn    DongleAlertFunc // 故障通知回调
	dongleFailCount  int             // dongle 连续检测失败次数
	dongleNotified   bool            // 是否已发送故障通知（故障解除后重置）
}

// StatusSubscriber 状态订阅者接口
type StatusSubscriber interface {
	OnStatusUpdate(info *StatusInfo)
	OnSMSReceived(device, number, message, timestamp string)
}

var (
	globalManager *Manager
	managerOnce   sync.Once
)

// GetManager 获取全局 AMI 管理器实例
func GetManager() *Manager {
	managerOnce.Do(func() {
		globalManager = &Manager{
			subscribers: make([]StatusSubscriber, 0),
		}
	})
	return globalManager
}

// Init 初始化 AMI 管理器
func (m *Manager) Init() error {
	// 重试连接 AMI，最多重试 10 次，每次间隔 2 秒
	// 因为 webpanel 启动时 Asterisk 可能还没有完全启动
	maxRetries := 10
	retryInterval := 2 * time.Second

	var client *Client
	var err error

	for i := 0; i < maxRetries; i++ {
		client, err = NewClient()
		if err == nil {
			break
		}
		if i < maxRetries-1 {
			log.Printf("Failed to connect to AMI (attempt %d/%d): %v, retrying in %v...", i+1, maxRetries, err, retryInterval)
			time.Sleep(retryInterval)
		}
	}

	if err != nil {
		return err
	}

	m.mu.Lock()
	m.client = client
	m.mu.Unlock()

	// 启动消息处理循环
	go m.handleMessages()

	// 启动状态更新循环
	go m.statusUpdateLoop()

	// 启动 dongle 设备健康检查循环
	go m.dongleHealthLoop()

	return nil
}

// handleMessages 处理 AMI 消息
func (m *Manager) handleMessages() {
	for {
		m.mu.RLock()
		client := m.client
		m.mu.RUnlock()

		if client == nil {
			// 如果客户端为 nil，尝试重新连接
			if err := m.reconnect(); err != nil {
				log.Printf("Failed to reconnect AMI: %v, retrying in 5s...", err)
				time.Sleep(5 * time.Second)
				continue
			}
			client = m.client
		}

		select {
		case msg := <-client.Messages():
			if msg != nil {
				m.processMessage(msg)
			}
		case err := <-client.Errors():
			if err != nil {
				log.Printf("AMI error: %v", err)
				// 如果是连接错误，尝试重新连接
				if err.Error() == "EOF" || err.Error() == "connection closed" {
					log.Println("AMI connection lost, attempting to reconnect...")
					m.reconnect()
				}
			}
		}
	}
}

// processMessage 处理单个 AMI 消息
func (m *Manager) processMessage(msg *goami2.Message) {
	eventType := msg.Field("Event")

	switch eventType {
	case "DongleSMSReceived", "QuectelSMSReceived", "UserEvent":
		// 处理收到的短信（支持 dongle 和 quectel）
		// UserEvent 是 dialplan 通过 UserEvent 应用发送的自定义事件
		if eventType == "UserEvent" && msg.Field("UserEvent") == "SMSReceived" {
			device := msg.Field("Device")
			number := msg.Field("Sender")
			message := msg.Field("Message")
			timestamp := msg.Field("Timestamp")
			smsIndexStr := msg.Field("SMSIndex")
			// 如果有 MessageBase64 字段,优先使用(避免特殊字符破坏 AMI 协议)
			if messageBase64 := msg.Field("MessageBase64"); messageBase64 != "" {
				if decoded, err := base64.StdEncoding.DecodeString(messageBase64); err == nil {
					message = string(decoded)
				}
			}
			if device != "" && number != "" && message != "" {
				// 解析短信索引
				smsIndex := 0
				if smsIndexStr != "" {
					if idx, err := strconv.Atoi(smsIndexStr); err == nil {
						smsIndex = idx
					}
				}
				m.notifySMSWithIndex(device, number, message, timestamp, smsIndex)
			}
		} else if eventType == "DongleSMSReceived" || eventType == "QuectelSMSReceived" {
			device := msg.Field("Device")
			if device == "" {
				device = msg.Field("QuectelDevice") // Quectel 可能使用不同的字段名
			}
			if device == "" {
				device = msg.Field("QuectelName") // 也可能是 QuectelName
			}
			number := msg.Field("Sender")
			if number == "" {
				number = msg.Field("From") // Quectel 可能使用 From 字段
			}
			message := msg.Field("Message")
			if message == "" {
				// Quectel 可能使用 BASE64 编码的短信
				smsBase64 := msg.Field("SMS_BASE64")
				if smsBase64 != "" {
					// 注意：这里需要解码 BASE64，但为了简化，先使用原始值
					// 实际解码应该在 dialplan 中完成，这里接收的应该是已解码的消息
					message = smsBase64
				}
			}
			timestamp := msg.Field("Timestamp")
			if device != "" && number != "" && message != "" {
				m.notifySMS(device, number, message, timestamp)
			}
		}
	case "FullyBooted":
		// Asterisk 完全启动完成，状态会在 Client.handleMessage 中更新
		log.Println("Asterisk fully booted event received")
	}
}

// notifySMS 通知订阅者收到短信
func (m *Manager) notifySMS(device, number, message, timestamp string) {
	m.notifySMSWithIndex(device, number, message, timestamp, 0)
}

// notifySMSWithIndex 通知订阅者收到短信（带索引）
func (m *Manager) notifySMSWithIndex(device, number, message, timestamp string, smsIndex int) {
	// 清理消息中的特殊字符,避免日志解析错误
	// 将 \r 和 \n 替换为空格
	message = strings.ReplaceAll(message, "\r", " ")
	message = strings.ReplaceAll(message, "\n", " ")

	m.mu.RLock()
	subscribers := make([]StatusSubscriber, len(m.subscribers))
	copy(subscribers, m.subscribers)
	m.mu.RUnlock()

	for _, sub := range subscribers {
		// 尝试调用带索引的方法，如果不存在则调用不带索引的方法
		if s, ok := sub.(interface {
			OnSMSReceivedWithIndex(device, number, message, timestamp string, index int)
		}); ok {
			s.OnSMSReceivedWithIndex(device, number, message, timestamp, smsIndex)
		} else {
			sub.OnSMSReceived(device, number, message, timestamp)
		}
	}
}

// DeleteSMS 删除 SIM 卡中的短信
func (m *Manager) DeleteSMS(device string, index int) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if err := m.checkClientHealth(); err != nil {
		return err
	}
	return m.client.DeleteSMS(device, index)
}

// DeleteAllSMS 删除 SIM 卡中的所有短信
func (m *Manager) DeleteAllSMS(device string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if err := m.checkClientHealth(); err != nil {
		return err
	}
	return m.client.DeleteAllSMS(device)
}

// statusUpdateLoop 状态更新循环
func (m *Manager) statusUpdateLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		m.updateStatus()
	}
}

// updateStatus 更新状态并通知订阅者
func (m *Manager) updateStatus() {
	m.mu.RLock()
	client := m.client
	subscribers := make([]StatusSubscriber, len(m.subscribers))
	copy(subscribers, m.subscribers)
	m.mu.RUnlock()

	if client == nil {
		return
	}

	// 如果状态是 restarting，尝试检测 Asterisk 是否已经启动完成
	currentStatus := client.GetStatus()
	if currentStatus == StatusRestarting {
		// 检查重启超时（60秒）
		client.mu.RLock()
		restartTime := client.restartTime
		client.mu.RUnlock()
		
		if restartTime != nil {
			elapsed := time.Since(*restartTime)
			if elapsed > 60*time.Second {
				// 超过60秒，强制恢复为 normal
				log.Printf("Asterisk restart timeout (%.0f seconds), forcing status to normal", elapsed.Seconds())
				client.mu.Lock()
				client.status = StatusNormal
				client.restartTime = nil
				client.mu.Unlock()
			} else {
				// 尝试获取运行时间，如果成功说明 Asterisk 已经启动
				uptime, err := client.GetUptime()
				if err == nil && uptime >= 0 {
					// Asterisk 已经启动，更新状态为 normal
					log.Printf("Asterisk restart completed (detected via uptime check: %d seconds), updating status to normal", uptime)
					client.mu.Lock()
					client.status = StatusNormal
					client.restartTime = nil
					client.mu.Unlock()
				}
			}
		} else {
			// 没有重启时间记录，尝试获取运行时间
			uptime, err := client.GetUptime()
			if err == nil && uptime >= 0 {
				// Asterisk 已经启动，更新状态为 normal
				log.Printf("Asterisk restart completed (detected via uptime check: %d seconds), updating status to normal", uptime)
				client.mu.Lock()
				client.status = StatusNormal
				client.mu.Unlock()
			}
		}
	}

	info, err := client.GetStatusInfo()
	if err != nil {
		m.mu.Lock()
		m.statusFailCount++
		failCount := m.statusFailCount
		m.mu.Unlock()
		log.Printf("Failed to get status info: %v (consecutive failures: %d)", err, failCount)

		// 连续失败超过 3 次，判定 AMI 连接已断开，触发重连
		if failCount >= 3 {
			log.Println("AMI connection health check failed 3 times in a row, forcing reconnect...")
			if rerr := m.reconnect(); rerr != nil {
				log.Printf("AMI reconnect failed: %v", rerr)
			} else {
				m.mu.Lock()
				m.statusFailCount = 0
				m.mu.Unlock()
				log.Println("AMI reconnected successfully after health check failure")
			}
		}
		return
	}

	// 成功获取状态，重置失败计数
	m.mu.Lock()
	m.statusFailCount = 0
	m.mu.Unlock()

	for _, sub := range subscribers {
		sub.OnStatusUpdate(info)
	}
}

// Subscribe 订阅状态更新
func (m *Manager) Subscribe(subscriber StatusSubscriber) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.subscribers = append(m.subscribers, subscriber)
}

// Unsubscribe 取消订阅
func (m *Manager) Unsubscribe(subscriber StatusSubscriber) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, sub := range m.subscribers {
		if sub == subscriber {
			m.subscribers = append(m.subscribers[:i], m.subscribers[i+1:]...)
			break
		}
	}
}

// GetClient 获取 AMI 客户端
func (m *Manager) GetClient() *Client {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.client
}

// checkClientHealth 检查 AMI 客户端是否健康（连接正常且近期通信成功）
func (m *Manager) checkClientHealth() error {
	if m.client == nil {
		return ErrNotConnected
	}
	if m.statusFailCount > 0 {
		return fmt.Errorf("AMI client unhealthy (consecutive status failures: %d), attempting reconnect", m.statusFailCount)
	}
	return nil
}

// Reload 重新加载配置
func (m *Manager) Reload() error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if err := m.checkClientHealth(); err != nil {
		return err
	}
	return m.client.Reload()
}

// Restart 重启 Asterisk
func (m *Manager) Restart() error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if err := m.checkClientHealth(); err != nil {
		return err
	}
	return m.client.Restart()
}

// SendSMS 发送短信
func (m *Manager) SendSMS(device, number, message string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if err := m.checkClientHealth(); err != nil {
		return err
	}
	return m.client.SendSMS(device, number, message)
}

// SetDongleAlertFn 设置 dongle 设备故障通知回调
func (m *Manager) SetDongleAlertFn(fn DongleAlertFunc) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dongleAlertFn = fn
}

// reconnect 重新连接 AMI
func (m *Manager) reconnect() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 关闭旧连接
	if m.client != nil {
		m.client.Close()
		m.client = nil
	}

	// 重试连接 AMI，最多重试 10 次，每次间隔 2 秒
	maxRetries := 10
	retryInterval := 2 * time.Second

	var client *Client
	var err error

	for i := 0; i < maxRetries; i++ {
		client, err = NewClient()
		if err == nil {
			break
		}
		if i < maxRetries-1 {
			log.Printf("Failed to reconnect to AMI (attempt %d/%d): %v, retrying in %v...", i+1, maxRetries, err, retryInterval)
			time.Sleep(retryInterval)
		}
	}

	if err != nil {
		return err
	}

	m.client = client
	log.Println("AMI reconnected successfully")
	return nil
}

// dongleHealthLoop 定期检查 dongle 设备健康状态
// 检测到设备离线时尝试 module reload chan_quectel.so 恢复
// 连续恢复失败后发送一次通知，故障解除后重置通知状态
func (m *Manager) dongleHealthLoop() {
	const (
		checkInterval    = 30 * time.Second // 每 30 秒检查一次
		maxReloadRetries = 3                // 连续 reload 失败多少次后发通知
		reloadCooldown   = 60 * time.Second // 每次 reload 后等待时间
	)

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	for range ticker.C {
		m.mu.RLock()
		client := m.client
		alertFn := m.dongleAlertFn
		m.mu.RUnlock()

		if client == nil {
			continue
		}

		// 查询所有 dongle 设备列表
		msg, err := client.SendCommand("quectel show devices", 5*time.Second)
		if err != nil {
			log.Printf("[DongleHealth] Failed to query devices: %v", err)
			continue
		}

		output := msg.Field("data")
		if output == "" {
			continue
		}

		// 解析输出，检查每个设备的 State 列
		// 输出格式（表头 + 数据行，字段按空格/多空格分隔）：
		// ID           Group State      RSSI ...
		// quectel0     0     Free       31  ...
		devices := parseQuectelDevices(output)

		for _, dev := range devices {
			if dev.State == "Free" || dev.State == "In use" {
				// 设备正常，重置失败计数和通知状态
				m.mu.Lock()
				if m.dongleFailCount > 0 || m.dongleNotified {
					log.Printf("[DongleHealth] Device %s recovered (state=%s), resetting alert state", dev.ID, dev.State)
					m.dongleFailCount = 0
					m.dongleNotified = false
				}
				m.mu.Unlock()
				continue
			}

			// 设备异常（Not connected / Not initialized 等）
			m.mu.Lock()
			m.dongleFailCount++
			failCount := m.dongleFailCount
			notified := m.dongleNotified
			m.mu.Unlock()

			log.Printf("[DongleHealth] Device %s unhealthy (state=%s), consecutive failures: %d", dev.ID, dev.State, failCount)

			log.Printf("[DongleHealth] Device %s unhealthy (state=%s), attempting module reload chan_quectel.so (attempt %d/%d)",
				dev.ID, dev.State, failCount, maxReloadRetries)

			_, rerr := client.SendCommand("module reload chan_quectel.so", 10*time.Second)
			if rerr != nil {
				log.Printf("[DongleHealth] module reload failed: %v", rerr)
			} else {
				log.Printf("[DongleHealth] module reload chan_quectel.so executed")
			}

			// reload 后等待设备重新初始化
			time.Sleep(reloadCooldown)

			// 连续失败达到阈值，发送一次通知
			if failCount >= maxReloadRetries && !notified && alertFn != nil {
				alertMsg := fmt.Sprintf("[DongleHealth] ALERT: Device %s failed after %d reload attempts (state=%s). Manual intervention required.",
					dev.ID, failCount, dev.State)
				log.Println(alertMsg)
				alertFn(dev.ID, alertMsg)

				m.mu.Lock()
				m.dongleNotified = true
				m.mu.Unlock()
			}
		}
	}
}

// quectelDeviceInfo 解析出的 dongle 设备信息
type quectelDeviceInfo struct {
	ID    string
	State string
}

// parseQuectelDevices 解析 "quectel show devices" 的输出
// 跳过表头行，解析设备 ID 和 State 字段
func parseQuectelDevices(output string) []quectelDeviceInfo {
	var devices []quectelDeviceInfo
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		// 跳过表头行（ID 开头的表头）
		if fields[0] == "ID" {
			continue
		}
		// fields[0]=ID, fields[1]=Group, fields[2]=State(可能截断)
		// State 列可能是 "Free", "Not", "In" 等
		state := fields[2]
		// "Not" 可能是 "Not connected" 或 "Not initialized" 被截断
		if state == "Not" && len(fields) > 3 {
			state = state + " " + fields[3]
		}
		devices = append(devices, quectelDeviceInfo{
			ID:    fields[0],
			State: state,
		})
	}
	return devices
}

// Close 关闭 AMI 管理器
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client != nil {
		return m.client.Close()
	}
	return nil
}
