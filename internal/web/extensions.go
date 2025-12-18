package web

import (
	"net/http"
	"strconv"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/gin-gonic/gin"
)

// ExtensionRequest Extension 请求结构
type ExtensionRequest struct {
	Username  string `json:"username" binding:"required"`
	Secret    string `json:"secret" binding:"required"`
	CallerID  string `json:"callerid"`
	Host      string `json:"host"`
	Context   string `json:"context"`
	Port      *int   `json:"port"` // 使用指针类型，支持空值（null）和数字
	Transport string `json:"transport"`
}

// listExtensions 列出所有 Extensions
func (r *Router) listExtensions(c *gin.Context) {
	var extensions []database.Extension
	if err := database.DB.Find(&extensions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, extensions)
}

// getExtension 获取单个 Extension
func (r *Router) getExtension(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var extension database.Extension
	if err := database.DB.First(&extension, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Extension not found"})
		return
	}

	c.JSON(http.StatusOK, extension)
}

// createExtension 创建 Extension
func (r *Router) createExtension(c *gin.Context) {
	var req ExtensionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 设置默认值
	if req.Host == "" {
		req.Host = "dynamic"
	}
	if req.Context == "" {
		req.Context = "default"
	}
	if req.Transport == "" {
		req.Transport = "tcp"
	}

	extension := database.Extension{
		Username:  req.Username,
		Secret:    req.Secret,
		CallerID:  req.CallerID,
		Host:      req.Host,
		Context:   req.Context,
		Transport: req.Transport,
	}
	// 处理 Port 字段：如果为 nil 或空，则设置为 0
	if req.Port != nil {
		extension.Port = *req.Port
	} else {
		extension.Port = 0
	}

	if err := database.DB.Create(&extension).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, extension)
}

// updateExtension 更新 Extension
func (r *Router) updateExtension(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req ExtensionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var extension database.Extension
	if err := database.DB.First(&extension, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Extension not found"})
		return
	}

	// 更新字段
	extension.Username = req.Username
	extension.Secret = req.Secret
	extension.CallerID = req.CallerID
	if req.Host != "" {
		extension.Host = req.Host
	}
	if req.Context != "" {
		extension.Context = req.Context
	}
	if req.Transport != "" {
		extension.Transport = req.Transport
	}
	// 处理 Port 字段：如果为 nil 或空，则保持原值或设置为 0
	if req.Port != nil {
		extension.Port = *req.Port
	}

	if err := database.DB.Save(&extension).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, extension)
}

// deleteExtension 删除 Extension
func (r *Router) deleteExtension(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var extension database.Extension
	if err := database.DB.First(&extension, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Extension not found"})
		return
	}

	// 检查是否有 Dongle 绑定
	var count int64
	database.DB.Model(&database.DongleBinding{}).Where("extension_id = ?", id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete extension with active dongle bindings"})
		return
	}

	if err := database.DB.Delete(&extension).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Extension deleted"})
}

// reloadConfig 重新加载配置
func (r *Router) reloadConfig() error {
	// 重新渲染配置文件
	if err := r.renderer.RenderAll(); err != nil {
		return err
	}

	// 通过 AMI 重新加载配置
	amiManager := ami.GetManager()
	if err := amiManager.Reload(); err != nil {
		return err
	}

	return nil
}
