package web

import (
	"net/http"
	"strings"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/gin-gonic/gin"
)

// getGlobalConfig 获取全局配置
func (r *Router) getGlobalConfig(c *gin.Context) {
	var config database.GlobalConfig
	// 全局配置只有一条记录，ID 为 1
	if err := database.DB.FirstOrCreate(&config, database.GlobalConfig{ID: 1}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if config.AudioABProfile == "" {
		config.AudioABProfile = "A"
	}
	c.JSON(http.StatusOK, config)
}

// updateGlobalConfig 更新全局配置
func (r *Router) updateGlobalConfig(c *gin.Context) {
	var req database.GlobalConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 查找或创建配置
	var config database.GlobalConfig
	if err := database.DB.FirstOrCreate(&config, database.GlobalConfig{ID: 1}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	prevProfile := config.AudioABProfile
	if prevProfile == "" {
		prevProfile = "A"
	}
	nextProfile := strings.ToUpper(strings.TrimSpace(req.AudioABProfile))
	if nextProfile != "B" {
		nextProfile = "A"
	}

	// 更新配置
	config.HTTPProxy = req.HTTPProxy
	config.DongleHealthEnabled = req.DongleHealthEnabled
	config.SoftphoneExtensionID = req.SoftphoneExtensionID
	config.AudioABProfile = nextProfile
	if err := database.DB.Save(&config).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	reloadSoftphoneFromDB()

	resp := gin.H{
		"id":                      config.ID,
		"http_proxy":              config.HTTPProxy,
		"dongle_health_enabled":   config.DongleHealthEnabled,
		"softphone_extension_id":  config.SoftphoneExtensionID,
		"audio_ab_profile":        config.AudioABProfile,
		"lazycat_uid":             config.LazycatUID,
		"asterisk_restarted":      false,
		"audio_profile_changed":   prevProfile != nextProfile,
	}

	// A/B 切换会改 modules.conf / rtp.conf / pjsip — 需要完整重启才生效
	if prevProfile != nextProfile {
		if err := r.renderer.RenderAll(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "saved but render failed: " + err.Error()})
			return
		}
		if err := ami.GetManager().Restart(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "saved but asterisk restart failed: " + err.Error()})
			return
		}
		resp["asterisk_restarted"] = true
	}

	c.JSON(http.StatusOK, resp)
}
