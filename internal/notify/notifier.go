package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"time"

	"github.com/ety001/lzc-mobile/internal/database"
)

// Notifier 通知器接口
type Notifier interface {
	Send(message string) error
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

	if n.config.SMTPTLS {
		// 使用 TLS
		return smtp.SendMail(addr, auth, n.config.SMTPFrom, []string{n.config.SMTPTo}, msg)
	}

	// 不使用 TLS（仅用于测试，生产环境建议使用 TLS）
	client, err := smtp.Dial(addr)
	if err != nil {
		return err
	}
	defer client.Close()

	if err = client.Auth(auth); err != nil {
		return err
	}

	if err = client.Mail(n.config.SMTPFrom); err != nil {
		return err
	}

	if err = client.Rcpt(n.config.SMTPTo); err != nil {
		return err
	}

	w, err := client.Data()
	if err != nil {
		return err
	}
	defer w.Close()

	_, err = w.Write(msg)
	return err
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

	client := &http.Client{Timeout: 10 * time.Second}
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

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.config.TelegramBotToken)
	payload := map[string]string{
		"chat_id": n.config.TelegramChatID,
		"text":    message,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
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

	client := &http.Client{Timeout: 10 * time.Second}
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
