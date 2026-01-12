package ami

import (
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"github.com/staskobzar/goami2"
)

// Client AMI 客户端
type Client struct {
	conn        net.Conn
	client      *goami2.Client
	mu          sync.RWMutex
	status      Status
	restartTime *time.Time // 记录重启开始时间
	errCh       chan error
	msgCh       chan *goami2.Message
	responseChs map[string]chan *goami2.Message
	responseMu  sync.RWMutex
}

// Status Asterisk 状态
type Status string

const (
	StatusUnknown    Status = "unknown"
	StatusNormal     Status = "normal"
	StatusRestarting Status = "restarting"
	StatusError      Status = "error"
)

// StatusInfo 状态信息
type StatusInfo struct {
	Status        Status    `json:"status"`
	Uptime        int64     `json:"uptime"`        // 运行时间（秒）
	Channels      int       `json:"channels"`      // 活动通道数
	Registrations int       `json:"registrations"` // SIP 注册数
	LastUpdate    time.Time `json:"last_update"`
}

// NewClient 创建新的 AMI 客户端
func NewClient() (*Client, error) {
	// 从环境变量读取配置
	host := os.Getenv("ASTERISK_AMI_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("ASTERISK_AMI_PORT")
	if port == "" {
		port = "5038"
	}
	username := os.Getenv("ASTERISK_AMI_USERNAME")
	if username == "" {
		return nil, fmt.Errorf("ASTERISK_AMI_USERNAME environment variable is required")
	}
	password := os.Getenv("ASTERISK_AMI_PASSWORD")
	if password == "" {
		return nil, fmt.Errorf("ASTERISK_AMI_PASSWORD environment variable is required")
	}

	// 建立 TCP 连接
	// 如果 host 是 localhost，强制使用 IPv4 (127.0.0.1) 以避免 IPv6 连接问题
	if host == "localhost" {
		host = "127.0.0.1"
	}
	// 使用 net.JoinHostPort 正确处理 IPv4 和 IPv6 地址
	address := net.JoinHostPort(host, port)
	conn, err := net.Dial("tcp", address)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to AMI: %w", err)
	}

	// 创建 AMI 客户端并登录
	client, err := goami2.NewClient(conn, username, password)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to login to AMI: %w", err)
	}

	c := &Client{
		conn:        conn,
		client:      client,
		status:      StatusUnknown,
		errCh:       make(chan error, 10),
		msgCh:       make(chan *goami2.Message, 100),
		responseChs: make(map[string]chan *goami2.Message),
	}

	// 启动消息监听
	go c.listen()

	// 订阅事件
	if err := c.subscribeEvents(); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to subscribe events: %w", err)
	}

	c.mu.Lock()
	c.status = StatusNormal
	c.mu.Unlock()

	log.Println("AMI client connected and ready")
	return c, nil
}

// listen 监听 AMI 消息和错误
func (c *Client) listen() {
	for {
		select {
		case msg := <-c.client.AllMessages():
			if msg != nil {
				c.handleMessage(msg)
			}
		case err := <-c.client.Err():
			if err != nil {
				if errors.Is(err, goami2.ErrEOF) {
					log.Println("AMI connection closed")
					c.mu.Lock()
					// 如果当前状态是 restarting，保持为 restarting，否则设置为 error
					if c.status != StatusRestarting {
						c.status = StatusError
					}
					c.mu.Unlock()
					return
				}
				log.Printf("AMI client error: %v", err)
				c.errCh <- err
			}
		}
	}
}

// handleMessage 处理收到的 AMI 消息
func (c *Client) handleMessage(msg *goami2.Message) {
	// 检查是否是等待的响应
	actionID := msg.Field("ActionID")
	if actionID != "" {
		c.responseMu.RLock()
		responseCh, exists := c.responseChs[actionID]
		c.responseMu.RUnlock()

		if exists {
			// 发送到响应通道
			select {
			case responseCh <- msg:
			default:
				// 通道已满，丢弃消息
			}
			// 清理响应通道
			c.responseMu.Lock()
			delete(c.responseChs, actionID)
			close(responseCh)
			c.responseMu.Unlock()
			return
		}
	}

	// 将消息发送到消息通道
	select {
	case c.msgCh <- msg:
	default:
		// 通道已满，丢弃消息
		log.Println("Message channel full, dropping message")
	}

	// 处理特定事件类型
	eventType := msg.Field("Event")
	switch eventType {
	case "FullyBooted":
		log.Println("Asterisk fully booted")
		c.mu.Lock()
		// 如果当前状态是 restarting，则恢复为 normal
		if c.status == StatusRestarting {
			c.status = StatusNormal
			c.restartTime = nil
			log.Println("Asterisk restart completed, status updated to normal")
		} else {
			c.status = StatusNormal
		}
		c.mu.Unlock()
	case "Shutdown":
		log.Println("Asterisk shutdown")
		c.mu.Lock()
		// 如果当前状态是 restarting，保持为 restarting（因为这是预期的）
		if c.status != StatusRestarting {
			c.status = StatusError
		}
		c.mu.Unlock()
	}
}

// subscribeEvents 订阅 AMI 事件
func (c *Client) subscribeEvents() error {
	// 订阅所有事件类型
	action := goami2.NewAction("Events")
	action.SetField("EventMask", "on")
	action.AddActionID()

	c.client.Send(action.Byte())
	return nil
}

// SendAction 发送 AMI 动作
func (c *Client) SendAction(action *goami2.Message) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.status == StatusError {
		return fmt.Errorf("AMI client is not connected")
	}

	c.client.Send(action.Byte())
	return nil
}

// Reload 重新加载 Asterisk 配置
func (c *Client) Reload() error {
	// 先执行 CoreReload 重新加载所有配置
	action := goami2.NewAction("CoreReload")
	action.AddActionID()
	if err := c.SendAction(action); err != nil {
		return err
	}

	// 然后显式 reload SIP 配置，确保 SIP 用户配置被重新加载
	sipAction := goami2.NewAction("Command")
	sipAction.SetField("Command", "sip reload")
	sipAction.AddActionID()
	return c.SendAction(sipAction)
}

// Restart 重启 Asterisk
func (c *Client) Restart() error {
	c.mu.Lock()
	c.status = StatusRestarting
	now := time.Now()
	c.restartTime = &now
	c.mu.Unlock()

	// 使用 Command 动作执行 CLI 命令来重启 Asterisk
	// CoreRestart 可能不会真正重启，使用 CLI 命令更可靠
	action := goami2.NewAction("Command")
	action.SetField("Command", "core restart now")
	action.AddActionID()

	return c.SendAction(action)
}

// SendSMS 通过 dongle 发送短信
func (c *Client) SendSMS(device, number, message string) error {
	// dongle 发送短信的命令格式：dongle send sms <device> <number> <message>
	action := goami2.NewAction("Command")
	action.SetField("Command", fmt.Sprintf("dongle send sms %s %s %s", device, number, message))
	action.AddActionID()

	return c.SendAction(action)
}

// GetStatus 获取当前状态
func (c *Client) GetStatus() Status {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.status
}

// GetStatusInfo 获取详细状态信息
func (c *Client) GetStatusInfo() (*StatusInfo, error) {
	status := c.GetStatus()
	info := &StatusInfo{
		Status:     status,
		LastUpdate: time.Now(),
	}

	// 获取通道数
	if channels, err := c.getChannelCount(); err == nil {
		info.Channels = channels
	}

	// 获取 SIP 注册数
	if registrations, err := c.getRegistrationCount(); err == nil {
		info.Registrations = registrations
	}

	// 获取运行时间
	if uptime, err := c.GetUptime(); err == nil {
		info.Uptime = uptime
	}

	return info, nil
}

// getChannelCount 获取活动通道数
func (c *Client) getChannelCount() (int, error) {
	action := goami2.NewAction("CoreShowChannels")
	action.AddActionID()

	if err := c.SendAction(action); err != nil {
		return 0, err
	}

	// 简化实现：通过事件统计通道数
	// 实际应该解析 CoreShowChannelsComplete 事件
	// 这里先返回 0，后续可以通过事件监听来更新
	return 0, nil
}

// getRegistrationCount 获取 SIP 注册数
func (c *Client) getRegistrationCount() (int, error) {
	action := goami2.NewAction("SIPPeers")
	action.AddActionID()

	if err := c.SendAction(action); err != nil {
		return 0, err
	}

	// 简化实现：通过事件统计注册数
	// 实际应该解析 SIPpeerEntry 事件
	// 这里先返回 0，后续可以通过事件监听来更新
	return 0, nil
}

// GetUptime 获取运行时间（秒）
func (c *Client) GetUptime() (int64, error) {
	action := goami2.NewAction("CoreStatus")
	action.AddActionID()
	actionID := action.Field("ActionID")

	// 创建响应通道
	responseCh := make(chan *goami2.Message, 1)
	c.responseMu.Lock()
	c.responseChs[actionID] = responseCh
	c.responseMu.Unlock()

	// 确保清理响应通道（如果超时，通道还未被 handleMessage 关闭）
	defer func() {
		c.responseMu.Lock()
		if _, exists := c.responseChs[actionID]; exists {
			// 如果通道还在 map 中，说明超时了，需要关闭通道
			delete(c.responseChs, actionID)
			close(responseCh)
		}
		c.responseMu.Unlock()
	}()

	// 发送动作
	if err := c.SendAction(action); err != nil {
		return 0, err
	}

	// 等待响应，最多等待 5 秒
	select {
	case msg := <-responseCh:
		// 检查响应状态
		if msg.Field("Response") != "Success" {
			return 0, fmt.Errorf("CoreStatus action failed: %s", msg.Field("Message"))
		}

		// 解析启动日期和时间
		startupDate := msg.Field("CoreStartupDate")
		startupTime := msg.Field("CoreStartupTime")

		if startupDate == "" || startupTime == "" {
			return 0, fmt.Errorf("missing startup date or time in response")
		}

		// 解析启动时间
		startupStr := startupDate + " " + startupTime
		startup, err := time.Parse("2006-01-02 15:04:05", startupStr)
		if err != nil {
			return 0, fmt.Errorf("failed to parse startup time: %w", err)
		}

		// 计算运行时间（秒）
		uptime := time.Since(startup).Seconds()
		return int64(uptime), nil
	case <-time.After(5 * time.Second):
		return 0, fmt.Errorf("timeout waiting for CoreStatus response")
	}
}

// Messages 返回消息通道
func (c *Client) Messages() <-chan *goami2.Message {
	return c.msgCh
}

// Errors 返回错误通道
func (c *Client) Errors() <-chan error {
	return c.errCh
}

// Close 关闭 AMI 客户端连接
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client != nil {
		c.client.Close()
		c.client = nil
	}
	return nil
}
