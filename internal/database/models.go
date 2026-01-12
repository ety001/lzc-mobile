package database

import (
	"time"

	"gorm.io/gorm"
)

// SIPConfig SIP 端口配置
type SIPConfig struct {
	ID        uint   `gorm:"primaryKey"`
	Port      int    `gorm:"not null;default:5060"` // SIP TCP 端口
	Host      string `gorm:"type:varchar(255)"`     // SIP 绑定地址，默认 0.0.0.0
	CreatedAt time.Time
	UpdatedAt time.Time
}

// RTPConfig RTP 端口范围配置
type RTPConfig struct {
	ID        uint `gorm:"primaryKey"`
	StartPort int  `gorm:"not null;default:40890"` // RTP 起始端口
	EndPort   int  `gorm:"not null;default:40900"` // RTP 结束端口
	CreatedAt time.Time
	UpdatedAt time.Time
}

// NotificationChannel 通知渠道类型
type NotificationChannel string

const (
	ChannelSMTP     NotificationChannel = "smtp"
	ChannelSlack    NotificationChannel = "slack"
	ChannelTelegram NotificationChannel = "telegram"
	ChannelWebhook  NotificationChannel = "webhook"
)

// NotificationConfig 通知渠道配置
type NotificationConfig struct {
	ID      uint                `gorm:"primaryKey" json:"id"`
	Channel NotificationChannel `gorm:"type:varchar(50);not null;uniqueIndex" json:"channel"` // 渠道类型
	Enabled bool                `gorm:"default:false" json:"enabled"`                         // 是否启用
	UseProxy bool               `gorm:"default:false" json:"use_proxy"`                        // 是否使用 HTTP 代理

	// SMTP 配置
	SMTPHost     string `gorm:"type:varchar(255)" json:"smtp_host"`     // SMTP 服务器地址
	SMTPPort     int    `json:"smtp_port"`                               // SMTP 端口
	SMTPUser     string `gorm:"type:varchar(255)" json:"smtp_user"`     // SMTP 用户名
	SMTPPassword string `gorm:"type:varchar(255)" json:"smtp_password"` // SMTP 密码
	SMTPFrom     string `gorm:"type:varchar(255)" json:"smtp_from"`     // 发件人邮箱
	SMTPTo       string `gorm:"type:varchar(255)" json:"smtp_to"`        // 收件人邮箱
	SMTPTLS      bool   `gorm:"default:false" json:"smtp_tls"`            // 是否使用 TLS/SSL

	// Slack 配置
	SlackWebhookURL string `gorm:"type:varchar(500)" json:"slack_webhook_url"` // Slack Webhook URL

	// Telegram 配置
	TelegramBotToken string `gorm:"type:varchar(255)" json:"telegram_bot_token"` // Telegram Bot Token
	TelegramChatID   string `gorm:"type:varchar(255)" json:"telegram_chat_id"`    // Telegram Chat ID

	// Webhook 配置
	WebhookURL    string `gorm:"type:varchar(500)" json:"webhook_url"`             // Webhook URL
	WebhookMethod string `gorm:"type:varchar(10);default:POST" json:"webhook_method"` // HTTP 方法
	WebhookHeader string `gorm:"type:text" json:"webhook_header"`                     // 自定义请求头（JSON 格式）

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GlobalConfig 全局配置
type GlobalConfig struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	HTTPProxy string    `gorm:"type:varchar(500)" json:"http_proxy"` // HTTP 代理服务器地址（格式：http://host:port 或 https://host:port）
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Extension SIP Extension 配置
type Extension struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Username  string    `gorm:"type:varchar(100);not null;uniqueIndex" json:"username"` // SIP 用户名
	Secret    string    `gorm:"type:varchar(255);not null" json:"secret"`               // SIP 密码
	CallerID  string    `gorm:"type:varchar(255)" json:"callerid"`                      // 主叫号码显示
	Host      string    `gorm:"type:varchar(255);default:dynamic" json:"host"`          // 主机地址，默认 dynamic
	Context   string    `gorm:"type:varchar(100);default:default" json:"context"`       // 上下文
	Port      int       `json:"port"`                                                   // 端口（可选）
	Transport string    `gorm:"type:varchar(10);default:tcp" json:"transport"`          // 传输协议，默认 tcp
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DongleBinding Dongle 来去电绑定关系
type DongleBinding struct {
	ID          uint      `gorm:"primaryKey"`
	DongleID    string    `gorm:"type:varchar(100);not null;uniqueIndex"` // Dongle 设备 ID（如 dongle0）
	ExtensionID uint      `gorm:"not null;index"`                         // 关联的 Extension ID
	Extension   Extension `gorm:"foreignKey:ExtensionID"`                 // 外键关联
	Inbound     bool      `gorm:"default:true"`                           // 是否处理来电
	Outbound    bool      `gorm:"default:true"`                           // 是否处理去电
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// SMSMessage SMS 消息
type SMSMessage struct {
	ID          uint       `gorm:"primaryKey"`
	DongleID    string     `gorm:"type:varchar(100);not null;index"` // Dongle 设备 ID（如 dongle0）
	PhoneNumber string     `gorm:"type:varchar(50);not null;index"`  // 电话号码
	Content     string     `gorm:"type:text;not null"`               // 短信内容
	Pushed      bool       `gorm:"default:false;index"`              // 是否已推送
	PushedAt    *time.Time // 推送时间
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// AutoMigrate 自动迁移所有表
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&SIPConfig{},
		&RTPConfig{},
		&NotificationConfig{},
		&Extension{},
		&DongleBinding{},
		&SMSMessage{},
		&GlobalConfig{},
	)
}
