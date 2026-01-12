package web

import (
	"net/http"

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

	// 更新配置
	config.HTTPProxy = req.HTTPProxy
	if err := database.DB.Save(&config).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, config)
}
