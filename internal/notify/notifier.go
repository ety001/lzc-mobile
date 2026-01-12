package notify

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"strings"
	"time"

	"github.com/ety001/lzc-mobile/internal/database"
)

// Notifier 通知器接口
type Notifier interface {
	Send(message string) error
}

// getGlobalProxy 获取全局配置中的 HTTP 代理
func getGlobalProxy() (string, error) {
	var globalConfig database.GlobalConfig
	if err := database.DB.FirstOrCreate(&globalConfig, database.GlobalConfig{ID: 1}).Error; err != nil {
		return "", err
	}
	if globalConfig.HTTPProxy == "" {
		return "", nil
	}
	return globalConfig.HTTPProxy, nil
}

// dialWithProxy 通过 HTTP 代理建立 TCP 连接
func dialWithProxy(proxyURL, targetAddr string) (net.Conn, error) {
	u, err := url.Parse(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("invalid proxy URL: %w", err)
	}

	// 连接到代理服务器
	conn, err := net.Dial("tcp", u.Host)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to proxy: %w", err)
	}

	// 发送 HTTP CONNECT 请求
	connectReq := fmt.Sprintf("CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", targetAddr, targetAddr)
	if _, err := conn.Write([]byte(connectReq)); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to send CONNECT request: %w", err)
	}

	// 读取响应
	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to read proxy response: %w", err)
	}

	response := string(buf[:n])
	if !strings.HasPrefix(response, "HTTP/1.1 200") && !strings.HasPrefix(response, "HTTP/1.0 200") {
		conn.Close()
		return nil, fmt.Errorf("proxy CONNECT failed: %s", response)
	}

	return conn, nil
}

// SMTPNotifier SMTP 通知器
type SMTPNotifier struct {
	config *database.NotificationConfig
}

// NewSMTPNotifier 创建 SMTP 通知器
func NewSMTPNotifier(config *database.NotificationConfig) *SMTPNotifier {
	return &SMTPNotifier{config: config}
}

// Send 发送邮件
func (n *SMTPNotifier) Send(message string) error {
	if !n.config.Enabled {
		return nil
	}

	addr := fmt.Sprintf("%s:%d", n.config.SMTPHost, n.config.SMTPPort)
	auth := smtp.PlainAuth("", n.config.SMTPUser, n.config.SMTPPassword, n.config.SMTPHost)

	msg := []byte(fmt.Sprintf("To: %s\r\n", n.config.SMTPTo) +
		fmt.Sprintf("From: %s\r\n", n.config.SMTPFrom) +
		"Subject: LZC Mobile SMS Notification\r\n" +
		"\r\n" +
		message + "\r\n")

	// 检查是否使用代理
	var proxyURL string
	if n.config.UseProxy {
		var err error
		proxyURL, err = getGlobalProxy()
		if err != nil {
			return fmt.Errorf("failed to get proxy config: %w", err)
		}
		if proxyURL == "" {
			return fmt.Errorf("proxy is enabled but not configured in global settings")
		}
	}

	// 根据端口和 TLS 配置判断使用哪种连接方式
	// 465 端口：使用直接 TLS 连接
	// 587 端口：使用 STARTTLS
	// 25 端口：尝试使用 STARTTLS（现代服务器通常要求加密）
	if n.config.SMTPPort == 465 {
		// 465 端口：使用直接 TLS 连接
		return n.sendWithDirectTLS(addr, auth, msg, proxyURL)
	} else if n.config.SMTPTLS || n.config.SMTPPort == 587 || n.config.SMTPPort == 25 {
		// 启用 TLS 或使用 587/25 端口：使用 STARTTLS
		// 即使未明确启用 TLS，587 和 25 端口也尝试使用 STARTTLS（如果服务器支持）
		return n.sendWithSTARTTLS(addr, auth, msg, proxyURL)
	} else {
		// 其他端口且未启用 TLS：尝试不使用 TLS（可能失败，因为很多服务器要求加密）
		return n.sendWithoutTLS(addr, auth, msg, proxyURL)
	}
}

// sendWithDirectTLS 使用直接 TLS 连接发送邮件（用于 465 端口）
func (n *SMTPNotifier) sendWithDirectTLS(addr string, auth smtp.Auth, msg []byte, proxyURL string) error {
	host := n.config.SMTPHost
	if i := strings.LastIndex(addr, ":"); i > -1 {
		host = addr[:i]
	}

	tlsConfig := &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: false, // 生产环境应该验证证书
	}

	// 建立连接（通过代理或直接）
	var conn net.Conn
	var err error
	if proxyURL != "" {
		conn, err = dialWithProxy(proxyURL, addr)
		if err != nil {
			return fmt.Errorf("proxy dial failed: %w", err)
		}
		// 在代理连接上建立 TLS
		conn = tls.Client(conn, tlsConfig)
	} else {
		conn, err = tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("TLS dial failed: %w", err)
		}
	}
	defer conn.Close()

	// 创建 SMTP 客户端
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("SMTP client creation failed: %w", err)
	}
	defer client.Close()

	// 认证
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP authentication failed: %w", err)
	}

	// 发送邮件
	if err = client.Mail(n.config.SMTPFrom); err != nil {
		return fmt.Errorf("MAIL FROM failed: %w", err)
	}

	if err = client.Rcpt(n.config.SMTPTo); err != nil {
		return fmt.Errorf("RCPT TO failed: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA command failed: %w", err)
	}

	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("writing message failed: %w", err)
	}

	if err = w.Close(); err != nil {
		return fmt.Errorf("closing data writer failed: %w", err)
	}

	return client.Quit()
}

// sendWithSTARTTLS 使用 STARTTLS 发送邮件（用于 587 端口）
func (n *SMTPNotifier) sendWithSTARTTLS(addr string, auth smtp.Auth, msg []byte, proxyURL string) error {
	host := n.config.SMTPHost
	if i := strings.LastIndex(addr, ":"); i > -1 {
		host = addr[:i]
	}

	// 建立连接（通过代理或直接）
	var client *smtp.Client
	var err error
	if proxyURL != "" {
		conn, err := dialWithProxy(proxyURL, addr)
		if err != nil {
			return fmt.Errorf("proxy dial failed: %w", err)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			conn.Close()
			return fmt.Errorf("SMTP client creation failed: %w", err)
		}
	} else {
		client, err = smtp.Dial(addr)
		if err != nil {
			return fmt.Errorf("SMTP dial failed: %w", err)
		}
	}
	defer client.Close()

	// 检查服务器是否支持 STARTTLS
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: false, // 生产环境应该验证证书
		}
		if err = client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("STARTTLS failed: %w", err)
		}
	} else {
		// 服务器不支持 STARTTLS
		// 如果配置要求 TLS 或使用 587/25 端口，则返回错误
		if n.config.SMTPTLS || n.config.SMTPPort == 587 || n.config.SMTPPort == 25 {
			return fmt.Errorf("server does not support STARTTLS, but TLS is required for this port (%d)", n.config.SMTPPort)
		}
		// 否则继续使用未加密连接（不推荐）
	}

	// 认证
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP authentication failed: %w", err)
	}

	// 发送邮件
	if err = client.Mail(n.config.SMTPFrom); err != nil {
		return fmt.Errorf("MAIL FROM failed: %w", err)
	}

	if err = client.Rcpt(n.config.SMTPTo); err != nil {
		return fmt.Errorf("RCPT TO failed: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA command failed: %w", err)
	}

	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("writing message failed: %w", err)
	}

	if err = w.Close(); err != nil {
		return fmt.Errorf("closing data writer failed: %w", err)
	}

	return client.Quit()
}

// sendWithoutTLS 不使用 TLS 发送邮件（不推荐）
func (n *SMTPNotifier) sendWithoutTLS(addr string, auth smtp.Auth, msg []byte, proxyURL string) error {
	host := n.config.SMTPHost
	if i := strings.LastIndex(addr, ":"); i > -1 {
		host = addr[:i]
	}

	// 建立连接（通过代理或直接）
	var client *smtp.Client
	var err error
	if proxyURL != "" {
		conn, err := dialWithProxy(proxyURL, addr)
		if err != nil {
			return fmt.Errorf("proxy dial failed: %w", err)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			conn.Close()
			return fmt.Errorf("SMTP client creation failed: %w", err)
		}
	} else {
		client, err = smtp.Dial(addr)
		if err != nil {
			return fmt.Errorf("SMTP dial failed: %w", err)
		}
	}
	defer client.Close()

	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP authentication failed: %w", err)
	}

	if err = client.Mail(n.config.SMTPFrom); err != nil {
		return fmt.Errorf("MAIL FROM failed: %w", err)
	}

	if err = client.Rcpt(n.config.SMTPTo); err != nil {
		return fmt.Errorf("RCPT TO failed: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA command failed: %w", err)
	}
	defer w.Close()

	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("writing message failed: %w", err)
	}

	return nil
}

// SlackNotifier Slack 通知器
type SlackNotifier struct {
	config *database.NotificationConfig
}

// NewSlackNotifier 创建 Slack 通知器
func NewSlackNotifier(config *database.NotificationConfig) *SlackNotifier {
	return &SlackNotifier{config: config}
}

// Send 发送 Slack 消息
func (n *SlackNotifier) Send(message string) error {
	if !n.config.Enabled {
		return nil
	}

	payload := map[string]string{
		"text": message,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", n.config.SlackWebhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	// 配置 HTTP 客户端（支持代理）
	transport := &http.Transport{}
	if n.config.UseProxy {
		proxyURL, err := getGlobalProxy()
		if err != nil {
			return fmt.Errorf("failed to get proxy config: %w", err)
		}
		if proxyURL != "" {
			parsedProxyURL, err := url.Parse(proxyURL)
			if err != nil {
				return fmt.Errorf("invalid proxy URL: %w", err)
			}
			transport.Proxy = http.ProxyURL(parsedProxyURL)
		}
	}

	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: transport,
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("slack webhook returned status %d", resp.StatusCode)
	}

	return nil
}

// TelegramNotifier Telegram 通知器
type TelegramNotifier struct {
	config *database.NotificationConfig
}

// NewTelegramNotifier 创建 Telegram 通知器
func NewTelegramNotifier(config *database.NotificationConfig) *TelegramNotifier {
	return &TelegramNotifier{config: config}
}

// Send 发送 Telegram 消息
func (n *TelegramNotifier) Send(message string) error {
	if !n.config.Enabled {
		return nil
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.config.TelegramBotToken)
	payload := map[string]string{
		"chat_id": n.config.TelegramChatID,
		"text":    message,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	// 配置 HTTP 客户端（支持代理）
	transport := &http.Transport{}
	if n.config.UseProxy {
		proxyURL, err := getGlobalProxy()
		if err != nil {
			return fmt.Errorf("failed to get proxy config: %w", err)
		}
		if proxyURL != "" {
			parsedProxyURL, err := url.Parse(proxyURL)
			if err != nil {
				return fmt.Errorf("invalid proxy URL: %w", err)
			}
			transport.Proxy = http.ProxyURL(parsedProxyURL)
		}
	}

	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: transport,
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned status %d", resp.StatusCode)
	}

	return nil
}

// WebhookNotifier Webhook 通知器
type WebhookNotifier struct {
	config *database.NotificationConfig
}

// NewWebhookNotifier 创建 Webhook 通知器
func NewWebhookNotifier(config *database.NotificationConfig) *WebhookNotifier {
	return &WebhookNotifier{config: config}
}

// Send 发送 Webhook 请求
func (n *WebhookNotifier) Send(message string) error {
	if !n.config.Enabled {
		return nil
	}

	method := n.config.WebhookMethod
	if method == "" {
		method = "POST"
	}

	payload := map[string]string{
		"message":   message,
		"timestamp": time.Now().Format(time.RFC3339),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(method, n.config.WebhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	// 解析自定义请求头
	if n.config.WebhookHeader != "" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(n.config.WebhookHeader), &headers); err == nil {
			for k, v := range headers {
				req.Header.Set(k, v)
			}
		}
	}

	// 配置 HTTP 客户端（支持代理）
	transport := &http.Transport{}
	if n.config.UseProxy {
		proxyURL, err := getGlobalProxy()
		if err != nil {
			return fmt.Errorf("failed to get proxy config: %w", err)
		}
		if proxyURL != "" {
			parsedProxyURL, err := url.Parse(proxyURL)
			if err != nil {
				return fmt.Errorf("invalid proxy URL: %w", err)
			}
			transport.Proxy = http.ProxyURL(parsedProxyURL)
		}
	}

	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: transport,
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

// Manager 通知管理器
type Manager struct {
	notifiers map[database.NotificationChannel]Notifier
}

// NewManager 创建通知管理器
func NewManager() *Manager {
	return &Manager{
		notifiers: make(map[database.NotificationChannel]Notifier),
	}
}

// LoadConfigs 从数据库加载通知配置
func (m *Manager) LoadConfigs() error {
	var configs []database.NotificationConfig
	if err := database.DB.Find(&configs).Error; err != nil {
		return err
	}

	m.notifiers = make(map[database.NotificationChannel]Notifier)
	for _, config := range configs {
		var notifier Notifier
		switch config.Channel {
		case database.ChannelSMTP:
			notifier = NewSMTPNotifier(&config)
		case database.ChannelSlack:
			notifier = NewSlackNotifier(&config)
		case database.ChannelTelegram:
			notifier = NewTelegramNotifier(&config)
		case database.ChannelWebhook:
			notifier = NewWebhookNotifier(&config)
		}
		if notifier != nil {
			m.notifiers[config.Channel] = notifier
		}
	}

	return nil
}

// Send 并行发送通知到所有启用的渠道
func (m *Manager) Send(message string) []error {
	var errors []error
	errorCh := make(chan error, len(m.notifiers))

	// 并行发送
	for _, notifier := range m.notifiers {
		go func(n Notifier) {
			if err := n.Send(message); err != nil {
				errorCh <- err
			} else {
				errorCh <- nil
			}
		}(notifier)
	}

	// 收集错误
	for i := 0; i < len(m.notifiers); i++ {
		if err := <-errorCh; err != nil {
			errors = append(errors, err)
		}
	}

	return errors
}

// SendToChannels 发送通知到指定的渠道
func (m *Manager) SendToChannels(channels []database.NotificationChannel, message string) []error {
	var errors []error
	errorCh := make(chan error, len(channels))

	// 并行发送到指定渠道
	for _, channel := range channels {
		if notifier, ok := m.notifiers[channel]; ok {
			go func(n Notifier) {
				if err := n.Send(message); err != nil {
					errorCh <- err
				} else {
					errorCh <- nil
				}
			}(notifier)
		} else {
			errorCh <- nil
		}
	}

	// 收集错误
	for i := 0; i < len(channels); i++ {
		if err := <-errorCh; err != nil {
			errors = append(errors, err)
		}
	}

	return errors
}
