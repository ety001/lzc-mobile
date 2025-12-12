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
	client, err := NewClient()
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
		select {
		case msg := <-m.client.Messages():
			if msg != nil {
				m.processMessage(msg)
			}
		case err := <-m.client.Errors():
			if err != nil {
				log.Printf("AMI error: %v", err)
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

// Close 关闭 AMI 管理器
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client != nil {
		return m.client.Close()
	}
	return nil
}
