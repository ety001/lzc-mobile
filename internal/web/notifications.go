package web

import (
	"net/http"

	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/gin-gonic/gin"
)

// listNotificationConfigs 列出所有通知配置
func (r *Router) listNotificationConfigs(c *gin.Context) {
	var configs []database.NotificationConfig
	if err := database.DB.Find(&configs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, configs)
}

// updateNotificationConfig 更新通知配置
func (r *Router) updateNotificationConfig(c *gin.Context) {
	channel := database.NotificationChannel(c.Param("channel"))
	if channel != database.ChannelSMTP && channel != database.ChannelSlack &&
		channel != database.ChannelTelegram && channel != database.ChannelWebhook {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid channel type"})
		return
	}

	var req database.NotificationConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 查找或创建配置
	var config database.NotificationConfig
	if err := database.DB.Where("channel = ?", channel).First(&config).Error; err != nil {
		// 不存在则创建
		config.Channel = channel
		config.Enabled = req.Enabled
		config.SMTPHost = req.SMTPHost
		config.SMTPPort = req.SMTPPort
		config.SMTPUser = req.SMTPUser
		config.SMTPPassword = req.SMTPPassword
		config.SMTPFrom = req.SMTPFrom
		config.SMTPTo = req.SMTPTo
		config.SMTPTLS = req.SMTPTLS
		config.SlackWebhookURL = req.SlackWebhookURL
		config.TelegramBotToken = req.TelegramBotToken
		config.TelegramChatID = req.TelegramChatID
		config.WebhookURL = req.WebhookURL
		config.WebhookMethod = req.WebhookMethod
		config.WebhookHeader = req.WebhookHeader

		if err := database.DB.Create(&config).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		// 更新现有配置
		config.Enabled = req.Enabled
		config.SMTPHost = req.SMTPHost
		config.SMTPPort = req.SMTPPort
		config.SMTPUser = req.SMTPUser
		config.SMTPPassword = req.SMTPPassword
		config.SMTPFrom = req.SMTPFrom
		config.SMTPTo = req.SMTPTo
		config.SMTPTLS = req.SMTPTLS
		config.SlackWebhookURL = req.SlackWebhookURL
		config.TelegramBotToken = req.TelegramBotToken
		config.TelegramChatID = req.TelegramChatID
		config.WebhookURL = req.WebhookURL
		config.WebhookMethod = req.WebhookMethod
		config.WebhookHeader = req.WebhookHeader

		if err := database.DB.Save(&config).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, config)
}
