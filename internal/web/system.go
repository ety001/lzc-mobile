package web

import (
	"net/http"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/gin-gonic/gin"
)

// getSystemStatus 获取系统状态
func (r *Router) getSystemStatus(c *gin.Context) {
	amiManager := ami.GetManager()
	client := amiManager.GetClient()
	if client == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "error",
			"error":  "AMI client not connected",
		})
		return
	}

	info, err := client.GetStatusInfo()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, info)
}

// reloadAsterisk 重新加载 Asterisk 配置
func (r *Router) reloadAsterisk(c *gin.Context) {
	amiManager := ami.GetManager()
	if err := amiManager.Reload(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Asterisk reloaded successfully"})
}

// restartAsterisk 重启 Asterisk
func (r *Router) restartAsterisk(c *gin.Context) {
	amiManager := ami.GetManager()
	if err := amiManager.Restart(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Asterisk restart initiated"})
}
