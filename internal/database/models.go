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
	ID      uint                `gorm:"primaryKey"`
	Channel NotificationChannel `gorm:"type:varchar(50);not null;uniqueIndex"` // 渠道类型
	Enabled bool                `gorm:"default:false"`                         // 是否启用

	// SMTP 配置
	SMTPHost     string `gorm:"type:varchar(255)"` // SMTP 服务器地址
	SMTPPort     int    // SMTP 端口
	SMTPUser     string `gorm:"type:varchar(255)"` // SMTP 用户名
	SMTPPassword string `gorm:"type:varchar(255)"` // SMTP 密码
	SMTPFrom     string `gorm:"type:varchar(255)"` // 发件人邮箱
	SMTPTo       string `gorm:"type:varchar(255)"` // 收件人邮箱
	SMTPTLS      bool   `gorm:"default:false"`     // 是否使用 TLS/SSL

	// Slack 配置
	SlackWebhookURL string `gorm:"type:varchar(500)"` // Slack Webhook URL

	// Telegram 配置
	TelegramBotToken string `gorm:"type:varchar(255)"` // Telegram Bot Token
	TelegramChatID   string `gorm:"type:varchar(255)"` // Telegram Chat ID

	// Webhook 配置
	WebhookURL    string `gorm:"type:varchar(500)"`             // Webhook URL
	WebhookMethod string `gorm:"type:varchar(10);default:POST"` // HTTP 方法
	WebhookHeader string `gorm:"type:text"`                     // 自定义请求头（JSON 格式）

	CreatedAt time.Time
	UpdatedAt time.Time
}

// Extension SIP Extension 配置
type Extension struct {
	ID        uint   `gorm:"primaryKey"`
	Username  string `gorm:"type:varchar(100);not null;uniqueIndex"` // SIP 用户名
	Secret    string `gorm:"type:varchar(255);not null"`             // SIP 密码
	CallerID  string `gorm:"type:varchar(255)"`                      // 主叫号码显示
	Host      string `gorm:"type:varchar(255);default:dynamic"`      // 主机地址，默认 dynamic
	Context   string `gorm:"type:varchar(100);default:default"`      // 上下文
	Port      int    // 端口（可选）
	Transport string `gorm:"type:varchar(10);default:tcp"` // 传输协议，默认 tcp
	CreatedAt time.Time
	UpdatedAt time.Time
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

// AutoMigrate 自动迁移所有表
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&SIPConfig{},
		&RTPConfig{},
		&NotificationConfig{},
		&Extension{},
		&DongleBinding{},
	)
}
