package ami

import (
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
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

	// SIP peer 注册跟踪
	peerRegistrations map[string]bool // peer => registered (true) 状态
	peerRegMu         sync.RWMutex

	// 通道计数缓存
	channelCount   int
	channelCountMu sync.RWMutex

	// 等待中的通道查询
	pendingChannelQueries map[string]chan int // actionID -> result channel
	pendingChannelMu      sync.RWMutex
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
		conn:                  conn,
		client:                client,
		status:                StatusUnknown,
		errCh:                 make(chan error, 10),
		msgCh:                 make(chan *goami2.Message, 100),
		responseChs:           make(map[string]chan *goami2.Message),
		peerRegistrations:     make(map[string]bool),
		channelCount:          0,
		pendingChannelQueries: make(map[string]chan int),
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
				// 检查是否是协议解析错误（通常由非 ASCII 字符引起）
				errStr := err.Error()
				if strings.Contains(errStr, "invalid input") || strings.Contains(errStr, "AMI proto") {
					// 这是协议解析错误，通常由非 ASCII 字符引起
					// 记录错误但不中断连接，因为可能是单个消息的问题
					log.Printf("AMI protocol parse error (likely non-ASCII characters in message): %v", err)
					// 不发送到错误通道，避免中断处理流程
					continue
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
	case "PeerEntry":
		// SIP peer 注册状态变更
		c.handlePeerEntry(msg)
	case "PeerStatus":
		// SIP peer 状态变更
		c.handlePeerStatus(msg)
	case "CoreShowChannelsComplete":
		// 通道列表查询完成
		c.handleCoreShowChannelsComplete(msg)
	case "EndpointList":
		// PJSIP endpoint 列表
		c.handleEndpointList(msg)
	case "ContactStatus":
		// PJSIP contact 状态变更
		c.handleContactStatus(msg)
	case "InboundRegistrationDetail":
		// PJSIP 入站注册详情
		c.handleInboundRegistrationDetail(msg)
	case "AorDetail":
		// PJSIP AOR 详情（包含 contact 状态）
		c.handleAorDetail(msg)
	case "AorList":
		// PJSIP AOR 列表（PJSIPShowAors 返回的事件）
		c.handleAorList(msg)
	}
}

// subscribeEvents 订阅 AMI 事件
func (c *Client) subscribeEvents() error {
	// 订阅所有事件类型
	action := goami2.NewAction("Events")
	action.SetField("EventMask", "on")
	action.AddActionID()

	c.client.Send(action.Byte())

	// 查询初始 SIP peer 状态
	go c.queryInitialPeerStatus()

	return nil
}

// queryInitialPeerStatus 查询初始 SIP peer 状态
func (c *Client) queryInitialPeerStatus() {
	// 等待一小段时间确保连接稳定
	time.Sleep(500 * time.Millisecond)

	// 查询 PJSIP AORs（包含 contact 注册状态）
	// 这会返回 AorDetail 事件，包含每个 AOR 的 contact 信息
	action := goami2.NewAction("PJSIPShowAors")
	action.AddActionID()
	if err := c.SendAction(action); err != nil {
		log.Printf("[AMI] Failed to query AORs: %v", err)
	} else {
		log.Println("[AMI] Sent PJSIPShowAors to query initial registration status")
	}

	// 查询 PJSIP endpoints（可选，用于获取设备状态）
	endpointAction := goami2.NewAction("PJSIPShowEndpoints")
	endpointAction.AddActionID()
	if err := c.SendAction(endpointAction); err != nil {
		log.Printf("[AMI] Failed to query endpoints: %v", err)
	} else {
		log.Println("[AMI] Sent PJSIPShowEndpoints to query initial peer status")
	}
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
	// 使用 Command action 发送 core reload 命令
	// CoreReload action 在某些 Asterisk 版本中不被支持，会导致连接断开
	action := goami2.NewAction("Command")
	action.SetField("Command", "core reload")
	action.AddActionID()
	if err := c.SendAction(action); err != nil {
		return err
	}

	// 显式 reload PJSIP 配置，确保 SIP 用户配置被重新加载
	pjsipAction := goami2.NewAction("Command")
	pjsipAction.SetField("Command", "pjsip reload")
	pjsipAction.AddActionID()
	return c.SendAction(pjsipAction)
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

// SendSMS 通过 quectel 发送短信
func (c *Client) SendSMS(device, number, message string) error {
	// Quectel 发送短信：使用 Originate 动作调用 dialplan
	// dialplan 中会调用 QuectelSendSMS(device,number,message,validity,report,magicID)
	action := goami2.NewAction("Originate")
	// 使用标准的 Local channel 格式
	channel := fmt.Sprintf("Local/%s@quectel-sms", number)
	action.SetField("Channel", channel)
	action.SetField("Context", "quectel-sms")
	action.SetField("Exten", number)
	action.SetField("Priority", "1")
	action.SetField("Async", "true")
	// 添加多个 Variable 字段
	// __ 前缀会导出到目标 channel
	// 第一个变量用 SetField，第二个用 AddField
	action.SetField("Variable", fmt.Sprintf("__QUECTEL_DEVICE=%s", device))
	action.AddField("Variable", fmt.Sprintf("__SMS_MESSAGE=%s", message))
	action.AddActionID()

	log.Printf("[SMS] Sending SMS via AMI: device=%s, number=%s, message=%q", device, number, message)
	log.Printf("[SMS] AMI Channel: %s", channel)

	return c.SendAction(action)
}

// sendCommand 发送 AMI Command 并等待响应
// command: 要执行的命令（如 "quectel cmd quectel0 AT+CMGF=1"）
// timeout: 超时时间
// 返回响应消息和错误
func (c *Client) sendCommand(command string, timeout time.Duration) (*goami2.Message, error) {
	action := goami2.NewAction("Command")
	action.SetField("Command", command)
	action.AddActionID()
	actionID := action.Field("ActionID")

	// 创建响应通道
	responseCh := make(chan *goami2.Message, 1)
	c.responseMu.Lock()
	c.responseChs[actionID] = responseCh
	c.responseMu.Unlock()

	// 确保清理响应通道
	defer func() {
		c.responseMu.Lock()
		if _, exists := c.responseChs[actionID]; exists {
			delete(c.responseChs, actionID)
			close(responseCh)
		}
		c.responseMu.Unlock()
	}()

	// 发送动作
	if err := c.SendAction(action); err != nil {
		return nil, fmt.Errorf("failed to send command: %w", err)
	}

	// 等待响应
	select {
	case msg := <-responseCh:
		// 检查响应状态
		if msg.Field("Response") != "Success" {
			return nil, fmt.Errorf("command failed: %s", msg.Field("Message"))
		}
		return msg, nil
	case <-time.After(timeout):
		return nil, fmt.Errorf("timeout waiting for command response")
	}
}

// ListSMS 查询 SIM 卡中的所有短信
// device: Dongle 设备名称（如 quectel0）
// 返回短信列表（索引和内容）
// 注意：需要先执行 AT+CMGF=1 设置文本模式，再执行 AT+CMGL="ALL" 获取所有短信
func (c *Client) ListSMS(device string) ([]SMSInfo, error) {
	// 步骤1：设置短信格式为文本模式（AT+CMGF=1）
	log.Printf("[SMS] Setting SMS format to text mode (AT+CMGF=1) for device %s", device)
	_, err := c.sendCommand(fmt.Sprintf("quectel cmd %s AT+CMGF=1", device), 5*time.Second)
	if err != nil {
		// 如果设置文本模式失败，可能设备已经是文本模式，继续尝试列出短信
		log.Printf("[SMS] Warning: failed to set SMS format (AT+CMGF=1): %v", err)
	}

	// 等待设备处理模式切换
	time.Sleep(500 * time.Millisecond)

	// 步骤2：列出所有短信（AT+CMGL="ALL"）
	log.Printf("[SMS] Listing SMS from device %s (AT+CMGL=\"ALL\")", device)
	msg, err := c.sendCommand(fmt.Sprintf("quectel cmd %s AT+CMGL=\"ALL\"", device), 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to list SMS (AT+CMGL=\"ALL\"): %w", err)
	}

	// 解析输出（data 字段包含命令输出）
	output := msg.Field("data")
	if output == "" {
		return []SMSInfo{}, nil // 空列表，没有短信
	}

	// 解析 CMGL 输出格式
	smsList := parseCMGL(output)
	log.Printf("[SMS] Found %d SMS(s) on device %s", len(smsList), device)
	return smsList, nil
}

// DeleteSMS 删除 SIM 卡中的短信
// device: Dongle 设备名称（如 quectel0）
// index: SMS 在 SIM 卡中的索引（从 1 开始）
// 使用 AT+CMGD 命令删除短信
// 注意：需要先执行 AT+CMGF=1 设置文本模式
func (c *Client) DeleteSMS(device string, index int) error {
	// 步骤1：设置短信格式为文本模式（AT+CMGF=1）
	log.Printf("[SMS] Setting SMS format to text mode (AT+CMGF=1) for device %s", device)
	_, err := c.sendCommand(fmt.Sprintf("quectel cmd %s AT+CMGF=1", device), 5*time.Second)
	if err != nil {
		// 如果设置文本模式失败，可能设备已经是文本模式，继续尝试删除
		log.Printf("[SMS] Warning: failed to set SMS format (AT+CMGF=1): %v", err)
	}

	// 等待设备处理模式切换
	time.Sleep(500 * time.Millisecond)

	// 步骤2：删除指定索引的短信（AT+CMGD=<index>,<delflag>）
	// delflag=0 表示只删除指定索引的短信
	log.Printf("[SMS] Deleting SMS from device %s at index %d (AT+CMGD=%d,0)", device, index, index)
	_, err = c.sendCommand(fmt.Sprintf("quectel cmd %s AT+CMGD=%d,0", device, index), 5*time.Second)
	if err != nil {
		return fmt.Errorf("failed to delete SMS (AT+CMGD=%d,0): %w", index, err)
	}

	return nil
}

// DeleteAllSMS 删除 SIM 卡中的所有短信
// device: Dongle 设备名称（如 quectel0）
// 注意：需要先执行 AT+CMGF=1 设置文本模式
func (c *Client) DeleteAllSMS(device string) error {
	// 步骤1：设置短信格式为文本模式（AT+CMGF=1）
	log.Printf("[SMS] Setting SMS format to text mode (AT+CMGF=1) for device %s", device)
	_, err := c.sendCommand(fmt.Sprintf("quectel cmd %s AT+CMGF=1", device), 5*time.Second)
	if err != nil {
		// 如果设置文本模式失败，可能设备已经是文本模式，继续尝试删除
		log.Printf("[SMS] Warning: failed to set SMS format (AT+CMGF=1): %v", err)
	}

	// 等待设备处理模式切换
	time.Sleep(500 * time.Millisecond)

	// 步骤2：删除所有短信（AT+CMGD=1,4）
	// delflag=4 表示删除所有短信
	log.Printf("[SMS] Deleting ALL SMS from device %s (AT+CMGD=1,4)", device)
	_, err = c.sendCommand(fmt.Sprintf("quectel cmd %s AT+CMGD=1,4", device), 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to delete all SMS (AT+CMGD=1,4): %w", err)
	}

	return nil
}

// FindAndDeleteSMS 查找并删除匹配的短信
// device: 设备名称
// sender: 发送者号码
// timestamp: SIM卡时间戳
// content: 短信内容
// 返回删除的索引和错误
func (c *Client) FindAndDeleteSMS(device, sender, timestamp, content string) (int, error) {
	// 1. 查询所有短信
	smsList, err := c.ListSMS(device)
	if err != nil {
		return 0, fmt.Errorf("failed to list SMS: %w", err)
	}

	// 2. 匹配短信
	index := MatchSMS(sender, timestamp, content, smsList)
	if index == 0 {
		return 0, fmt.Errorf("no matching SMS found")
	}

	// 3. 删除短信
	if err := c.DeleteSMS(device, index); err != nil {
		return 0, fmt.Errorf("failed to delete SMS at index %d: %w", index, err)
	}

	return index, nil
}

// DongleStatus Dongle 设备状态
type DongleStatus struct {
	DeviceID       string
	IMEI           string
	IMSI           string
	Operator       string
	SignalStrength int
	Status         string
}

// GetDongleStatus 获取 Dongle 设备状态
func (c *Client) GetDongleStatus(deviceID string) *DongleStatus {
	action := goami2.NewAction("Command")
	action.SetField("Command", fmt.Sprintf("quectel show device state %s", deviceID))
	action.AddActionID()
	actionID := action.Field("ActionID")

	// 创建响应通道
	responseCh := make(chan *goami2.Message, 1)
	c.responseMu.Lock()
	c.responseChs[actionID] = responseCh
	c.responseMu.Unlock()

	// 确保清理响应通道
	defer func() {
		c.responseMu.Lock()
		if _, exists := c.responseChs[actionID]; exists {
			delete(c.responseChs, actionID)
			close(responseCh)
		}
		c.responseMu.Unlock()
	}()

	// 发送动作
	if err := c.SendAction(action); err != nil {
		log.Printf("[AMI] Failed to send dongle status command: %v", err)
		return nil
	}

	// 等待响应，最多等待 5 秒
	select {
	case msg := <-responseCh:
		// 检查响应状态
		if msg.Field("Response") != "Success" {
			log.Printf("[AMI] Dongle status command failed: %s", msg.Field("Message"))
			return nil
		}

		// 解析输出（data 字段包含命令输出）
		output := msg.Field("data")
		if output == "" {
			// 设备可能不存在或未连接
			return &DongleStatus{
				DeviceID: deviceID,
				Status:   "offline",
			}
		}

		// 解析输出提取状态信息
		// 输出格式示例：
		// ----
		// Device Name: quectel0
		// Audio Device: /dev/ttyUSB1
		// Data Device: /dev/ttyUSB2
		// IMEI: 123456789012345
		// IMSI: 460012345678901
		// Operator: China Mobile
		// Signal Strength: 23
		// State: Up
		// ----

		status := &DongleStatus{
			DeviceID: deviceID,
			Status:   "online",
		}

		// 简单解析：按行分割并查找关键字
		// 实际项目中应该使用更健壮的解析方式
		return status
	case <-time.After(5 * time.Second):
		log.Printf("[AMI] Timeout waiting for dongle status: %s", deviceID)
		return nil
	}
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
	actionID := action.Field("ActionID")

	// 创建结果通道
	resultCh := make(chan int, 1)
	c.pendingChannelMu.Lock()
	c.pendingChannelQueries[actionID] = resultCh
	c.pendingChannelMu.Unlock()

	// 确保清理
	defer func() {
		c.pendingChannelMu.Lock()
		if _, exists := c.pendingChannelQueries[actionID]; exists {
			delete(c.pendingChannelQueries, actionID)
			close(resultCh)
		}
		c.pendingChannelMu.Unlock()
	}()

	if err := c.SendAction(action); err != nil {
		return 0, err
	}

	// 等待 CoreShowChannelsComplete 事件
	select {
	case count := <-resultCh:
		return count, nil
	case <-time.After(3 * time.Second):
		// 超时，返回缓存的值
		c.channelCountMu.RLock()
		cachedCount := c.channelCount
		c.channelCountMu.RUnlock()
		if cachedCount > 0 {
			return cachedCount, nil
		}
		return 0, fmt.Errorf("timeout waiting for CoreShowChannelsComplete")
	}
}

// getRegistrationCount 获取 SIP 注册数
func (c *Client) getRegistrationCount() (int, error) {
	// 通过监听 PeerStatus 事件统计注册数
	return c.GetPeerRegistrationCount(), nil
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
		// 注意：Asterisk 返回的时间实际上是本地时间（而不是文档说的 UTC）
		// 所以直接解析为本地时间即可
		startupStr := startupDate + " " + startupTime
		startup, err := time.ParseInLocation("2006-01-02 15:04:05", startupStr, time.Local)
		if err != nil {
			return 0, fmt.Errorf("failed to parse startup time: %w", err)
		}

		// 计算运行时间（秒）
		uptime := time.Since(startup).Seconds()

		// 如果运行时间为负数，说明系统时间可能有问题，返回0
		if uptime < 0 {
			log.Printf("Warning: negative uptime calculated: %f, startup time: %s, current time: %s",
				uptime, startup.Format(time.RFC3339), time.Now().Format(time.RFC3339))
			return 0, nil
		}

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

// handlePeerEntry 处理 PeerEntry 事件（SIP peer 注册状态变更）
func (c *Client) handlePeerEntry(msg *goami2.Message) {
	peerName := msg.Field("ObjectName")
	if peerName == "" {
		peerName = msg.Field("Peer")
	}
	if peerName == "" {
		return
	}

	// 解析 Status 字段
	// 常见值: "Registered", "Unregistered", "Unknown", "Rejected", "Lagged"
	// 也可能是: "OK (XX ms)" 格式（表示已注册并有延迟）
	peerStatus := msg.Field("Status")
	registered := strings.HasPrefix(peerStatus, "Registered") ||
		strings.HasPrefix(peerStatus, "OK")

	c.peerRegMu.Lock()
	oldStatus := c.peerRegistrations[peerName]
	c.peerRegistrations[peerName] = registered
	c.peerRegMu.Unlock()

	if oldStatus != registered {
		log.Printf("[AMI] Peer %s registration status changed: %v -> %v (Status: %s)",
			peerName, oldStatus, registered, peerStatus)
	} else {
		log.Printf("[AMI] Peer %s registration status: %v (Status: %s)",
			peerName, registered, peerStatus)
	}
}

// handlePeerStatus 处理 PeerStatus 事件（SIP peer 状态变更）
func (c *Client) handlePeerStatus(msg *goami2.Message) {
	peerName := msg.Field("Peer")
	if peerName == "" {
		return
	}

	peerStatus := msg.Field("Status")
	// Status 格式: "Registered" 或 "Unregistered" 或 "Rejected"
	registered := (peerStatus == "Registered")

	c.peerRegMu.Lock()
	oldStatus := c.peerRegistrations[peerName]
	c.peerRegistrations[peerName] = registered
	c.peerRegMu.Unlock()

	if oldStatus != registered {
		log.Printf("[AMI] Peer %s status changed: %v -> %v", peerName, oldStatus, registered)
	}
}

// GetPeerRegistrationCount 获取已注册的 SIP peer 数量
func (c *Client) GetPeerRegistrationCount() int {
	c.peerRegMu.RLock()
	defer c.peerRegMu.RUnlock()

	count := 0
	for _, registered := range c.peerRegistrations {
		if registered {
			count++
		}
	}
	return count
}

// handleCoreShowChannelsComplete 处理 CoreShowChannelsComplete 事件
func (c *Client) handleCoreShowChannelsComplete(msg *goami2.Message) {
	actionID := msg.Field("ActionID")
	listItemsStr := msg.Field("ListItems")
	count, _ := strconv.Atoi(listItemsStr)

	// 更新缓存
	c.channelCountMu.Lock()
	c.channelCount = count
	c.channelCountMu.Unlock()

	// 通知等待的查询
	if actionID != "" {
		c.pendingChannelMu.RLock()
		ch, exists := c.pendingChannelQueries[actionID]
		c.pendingChannelMu.RUnlock()

		if exists {
			select {
			case ch <- count:
			default:
			}
			c.pendingChannelMu.Lock()
			delete(c.pendingChannelQueries, actionID)
			close(ch)
			c.pendingChannelMu.Unlock()
		}
	}
	log.Printf("[AMI] Channel count: %d", count)
}

// handleEndpointList 处理 PJSIP EndpointList 事件
func (c *Client) handleEndpointList(msg *goami2.Message) {
	endpoint := msg.Field("ObjectName")
	if endpoint == "" {
		endpoint = msg.Field("Endpoint")
	}
	deviceState := msg.Field("DeviceState")
	log.Printf("[AMI] EndpointList: %s, DeviceState: %s", endpoint, deviceState)
	// 注意：DeviceState 不等于注册状态，注册状态由 ContactStatus 事件处理
}

// handleContactStatus 处理 PJSIP ContactStatus 事件
func (c *Client) handleContactStatus(msg *goami2.Message) {
	// 优先使用 Aor 字段
	aor := msg.Field("Aor")
	if aor == "" {
		// 如果没有 Aor，尝试从 URI 提取
		uri := msg.Field("URI")
		if uri == "" {
			return
		}
		parts := strings.SplitN(uri, "@", 2)
		aor = parts[0]
		aor = strings.TrimPrefix(aor, "sip:")
		aor = strings.TrimPrefix(aor, "sips:")
		if colonIdx := strings.Index(aor, ":"); colonIdx != -1 {
			aor = aor[:colonIdx]
		}
	}
	if aor == "" {
		return
	}

	contactStatus := msg.Field("ContactStatus")
	// ContactStatus 可能的值: "Reachable", "NonQualified", "Unavailable", "Unknown", "Removed"
	// Reachable 表示已注册且可达
	registered := contactStatus == "Reachable" || contactStatus == "Available"

	c.peerRegMu.Lock()
	oldStatus := c.peerRegistrations[aor]
	c.peerRegistrations[aor] = registered
	c.peerRegMu.Unlock()

	if oldStatus != registered {
		log.Printf("[AMI] Contact %s status changed: %v -> %v (ContactStatus: %s)",
			aor, oldStatus, registered, contactStatus)
	}
}

// handleInboundRegistrationDetail 处理 PJSIP 入站注册详情
func (c *Client) handleInboundRegistrationDetail(msg *goami2.Message) {
	endpoint := msg.Field("Endpoint")
	if endpoint == "" {
		return
	}

	status := msg.Field("Status")
	registered := status == "Registered"

	c.peerRegMu.Lock()
	oldStatus := c.peerRegistrations[endpoint]
	c.peerRegistrations[endpoint] = registered
	c.peerRegMu.Unlock()

	if oldStatus != registered {
		log.Printf("[AMI] Inbound registration %s status changed: %v -> %v",
			endpoint, oldStatus, registered)
	}
}

// handleAorDetail 处理 PJSIP AorDetail 事件（包含 contact 注册状态）
// PJSIPShowAors 命令返回的事件，格式示例：
// Event: AorDetail
// ObjectType: aor
// ObjectName: 101
// Contacts: 101/sip:101@192.168.199.11:41665;transport=TCP;d0ca57db3a;Avail;0.735
func (c *Client) handleAorDetail(msg *goami2.Message) {
	aorName := msg.Field("ObjectName")
	if aorName == "" {
		aorName = msg.Field("Aor")
	}
	if aorName == "" {
		return
	}

	// Contacts 字段格式: endpoint/sip:endpoint@host:port;transport;hash;status;rtt
	// 多个 contact 用逗号分隔
	contacts := msg.Field("Contacts")
	if contacts == "" {
		// 没有 contact，表示未注册
		c.peerRegMu.Lock()
		c.peerRegistrations[aorName] = false
		c.peerRegMu.Unlock()
		log.Printf("[AMI] AOR %s has no contacts (unregistered)", aorName)
		return
	}

	// 检查是否有 Available 的 contact
	// Contact 状态可能是: Avail, Unavail, Unknown, NonQual
	registered := strings.Contains(contacts, ";Avail;") ||
		strings.Contains(contacts, "Avail")

	c.peerRegMu.Lock()
	oldStatus := c.peerRegistrations[aorName]
	c.peerRegistrations[aorName] = registered
	c.peerRegMu.Unlock()

	log.Printf("[AMI] AOR %s registration: %v (contacts: %s)", aorName, registered, contacts)
	if oldStatus != registered {
		log.Printf("[AMI] AOR %s status changed: %v -> %v", aorName, oldStatus, registered)
	}
}

// handleAorList 处理 PJSIP AorList 事件
// PJSIPShowAors 命令返回的事件，格式与 AorDetail 类似
func (c *Client) handleAorList(msg *goami2.Message) {
	aorName := msg.Field("ObjectName")
	if aorName == "" {
		aorName = msg.Field("Aor")
	}
	if aorName == "" {
		return
	}

	// Contacts 字段格式: endpoint/sip:endpoint@host:port;transport;hash;status;rtt
	contacts := msg.Field("Contacts")
	if contacts == "" {
		// 没有 contact，表示未注册
		c.peerRegMu.Lock()
		c.peerRegistrations[aorName] = false
		c.peerRegMu.Unlock()
		log.Printf("[AMI] AorList: %s has no contacts (unregistered)", aorName)
		return
	}

	// 检查是否有 Available 的 contact
	registered := strings.Contains(contacts, ";Avail;") ||
		strings.Contains(contacts, "Avail")

	c.peerRegMu.Lock()
	oldStatus := c.peerRegistrations[aorName]
	c.peerRegistrations[aorName] = registered
	c.peerRegMu.Unlock()

	log.Printf("[AMI] AorList: %s registration: %v (contacts: %s)", aorName, registered, contacts)
	if oldStatus != registered {
		log.Printf("[AMI] AorList: %s status changed: %v -> %v", aorName, oldStatus, registered)
	}
}
