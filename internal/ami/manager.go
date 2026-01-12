package ami

import (
	"log"
	"sync"
	"time"

	"github.com/staskobzar/goami2"
)

// Manager AMI 管理器（单例）
type Manager struct {
	client      *Client
	subscribers []StatusSubscriber
	mu          sync.RWMutex
}

// StatusSubscriber 状态订阅者接口
type StatusSubscriber interface {
	OnStatusUpdate(info *StatusInfo)
	OnSMSReceived(device, number, message string)
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
	case "DongleSMSReceived":
		// 处理收到的短信
		device := msg.Field("Device")
		number := msg.Field("Sender")
		message := msg.Field("Message")
		if device != "" && number != "" && message != "" {
			m.notifySMS(device, number, message)
		}
	case "FullyBooted":
		// Asterisk 完全启动完成，状态会在 Client.handleMessage 中更新
		log.Println("Asterisk fully booted event received")
	}
}

// notifySMS 通知订阅者收到短信
func (m *Manager) notifySMS(device, number, message string) {
	m.mu.RLock()
	subscribers := make([]StatusSubscriber, len(m.subscribers))
	copy(subscribers, m.subscribers)
	m.mu.RUnlock()

	for _, sub := range subscribers {
		sub.OnSMSReceived(device, number, message)
	}
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
		log.Printf("Failed to get status info: %v", err)
		return
	}

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

// Reload 重新加载配置
func (m *Manager) Reload() error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.client == nil {
		return ErrNotConnected
	}
	return m.client.Reload()
}

// Restart 重启 Asterisk
func (m *Manager) Restart() error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.client == nil {
		return ErrNotConnected
	}
	return m.client.Restart()
}

// SendSMS 发送短信
func (m *Manager) SendSMS(device, number, message string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.client == nil {
		return ErrNotConnected
	}
	return m.client.SendSMS(device, number, message)
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

// Close 关闭 AMI 管理器
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client != nil {
		return m.client.Close()
	}
	return nil
}
