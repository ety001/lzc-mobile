package web

import (
	"log"
	"net/http"
	"strconv"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/gin-gonic/gin"
)

// DongleBindingRequest Dongle 绑定请求结构
type DongleBindingRequest struct {
	DongleID    string `json:"dongle_id" binding:"required"`
	ExtensionID uint   `json:"extension_id" binding:"required"`
	Inbound     bool   `json:"inbound"`
	Outbound    bool   `json:"outbound"`
}

// SendSMSRequest 发送短信请求结构
type SendSMSRequest struct {
	Number  string `json:"number" binding:"required"`
	Message string `json:"message" binding:"required"`
}

// listDongleBindings 列出所有 Dongle 绑定
func (r *Router) listDongleBindings(c *gin.Context) {
	var bindings []database.DongleBinding
	if err := database.DB.Preload("Extension").Find(&bindings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, bindings)
}

// createDongleBinding 创建 Dongle 绑定
func (r *Router) createDongleBinding(c *gin.Context) {
	var req DongleBindingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 检查 Extension 是否存在
	var extension database.Extension
	if err := database.DB.First(&extension, req.ExtensionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Extension not found"})
		return
	}

	// 注意：一个 dongle 可以绑定多个 extension，所以不再检查唯一性

	binding := database.DongleBinding{
		DongleID:    req.DongleID,
		ExtensionID: req.ExtensionID,
		Inbound:     req.Inbound,
		Outbound:    req.Outbound,
	}

	if err := database.DB.Create(&binding).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	// 重新加载 Extension 关联
	database.DB.Preload("Extension").First(&binding, binding.ID)

	c.JSON(http.StatusCreated, binding)
}

// updateDongleBinding 更新 Dongle 绑定
func (r *Router) updateDongleBinding(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req DongleBindingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var binding database.DongleBinding
	if err := database.DB.First(&binding, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dongle binding not found"})
		return
	}

	// 检查 Extension 是否存在
	var extension database.Extension
	if err := database.DB.First(&extension, req.ExtensionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Extension not found"})
		return
	}

	// 更新字段
	binding.ExtensionID = req.ExtensionID
	binding.Inbound = req.Inbound
	binding.Outbound = req.Outbound

	if err := database.DB.Save(&binding).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	// 重新加载 Extension 关联
	database.DB.Preload("Extension").First(&binding, binding.ID)

	c.JSON(http.StatusOK, binding)
}

// deleteDongleBinding 删除 Dongle 绑定
func (r *Router) deleteDongleBinding(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var binding database.DongleBinding
	if err := database.DB.First(&binding, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dongle binding not found"})
		return
	}

	if err := database.DB.Delete(&binding).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Dongle binding deleted"})
}

// sendSMS 发送短信
func (r *Router) sendSMS(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req SendSMSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 获取 Dongle 绑定
	var binding database.DongleBinding
	if err := database.DB.First(&binding, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dongle binding not found"})
		return
	}

	// 通过 AMI 发送短信
	amiManager := ami.GetManager()
	if err := amiManager.SendSMS(binding.DongleID, req.Number, req.Message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send SMS: " + err.Error()})
		return
	}

	// 保存发送的短信到数据库（方向为 outbound）
	smsMessage := database.SMSMessage{
		DongleID:    binding.DongleID,
		PhoneNumber: req.Number,
		Content:     req.Message,
		Direction:   "outbound",
		Pushed:      false, // 发送的短信不需要推送通知
		PushedAt:    nil,
	}
	if err := database.DB.Create(&smsMessage).Error; err != nil {
		// 记录错误但不影响响应
		log.Printf("Error saving sent SMS to database: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"message": "SMS sent successfully"})
}
