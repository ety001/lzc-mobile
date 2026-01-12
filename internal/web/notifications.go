package web

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/notify"
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
		config.UseProxy = req.UseProxy
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
		config.UseProxy = req.UseProxy
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

	// 重新加载通知配置（通过创建新的通知管理器并加载配置）
	notifyManager := notify.NewManager()
	if err := notifyManager.LoadConfigs(); err != nil {
		// 即使重新加载失败，也返回成功（配置已保存）
		log.Printf("Warning: Failed to reload notification configs: %v", err)
	}

	c.JSON(http.StatusOK, config)
}

// testNotificationConfig 测试通知配置
func (r *Router) testNotificationConfig(c *gin.Context) {
	channel := database.NotificationChannel(c.Param("channel"))
	if channel != database.ChannelSMTP && channel != database.ChannelSlack &&
		channel != database.ChannelTelegram && channel != database.ChannelWebhook {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid channel type"})
		return
	}

	// 获取配置
	var config database.NotificationConfig
	if err := database.DB.Where("channel = ?", channel).First(&config).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Configuration not found"})
		return
	}

	if !config.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel is not enabled"})
		return
	}

	// 创建通知管理器并加载配置
	notifyManager := notify.NewManager()
	if err := notifyManager.LoadConfigs(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load configs: " + err.Error()})
		return
	}

	// 发送测试消息
	testMessage := fmt.Sprintf("测试消息 - 来自 LZC Mobile 通知系统\n时间: %s\n渠道: %s", time.Now().Format("2006-01-02 15:04:05"), channel)
	
	errors := notifyManager.SendToChannels([]database.NotificationChannel{channel}, testMessage)
	
	if len(errors) > 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"error":   errors[0].Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "测试消息发送成功",
	})
}
