package web

import (
	"log"
	"net/http"
	"strconv"
	"sync"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/gin-gonic/gin"
)

// 操作锁（防止重复提交）
var (
	deviceMutex sync.Mutex
	bindingMutex sync.Mutex
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
	bindingMutex.Lock()
	defer bindingMutex.Unlock()

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

// deleteDongleBinding 删除 Dongle 绑定
func (r *Router) deleteDongleBinding(c *gin.Context) {
	bindingMutex.Lock()
	defer bindingMutex.Unlock()

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

// DongleRequest Dongle 设备请求结构
type DongleRequest struct {
	DeviceID   string `json:"device_id" binding:"required"`
	Device     string `json:"device"`
	Audio      string `json:"audio"`
	Data       string `json:"data"`
	Group      int    `json:"group"`
	Context    string `json:"context"`
	DialPrefix string `json:"dial_prefix"`
	Disable    bool   `json:"disable"`
}

// listDongles 列出所有 Dongle 设备
func (r *Router) listDongles(c *gin.Context) {
	var dongles []database.Dongle
	if err := database.DB.Find(&dongles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 通过 AMI 获取实时状态（TODO: 实现 AMI 获取设备状态的方法）
	// amiManager := ami.GetManager()
	// for i := range dongles {
	// 	if status := amiManager.GetDongleStatus(dongles[i].DeviceID); status != nil {
	// 		dongles[i].IMEI = status.IMEI
	// 		dongles[i].IMSI = status.IMSI
	// 		dongles[i].Operator = status.Operator
	// 		dongles[i].SignalStrength = status.SignalStrength
	// 		dongles[i].Status = status.Status
	// 	}
	// }

	c.JSON(http.StatusOK, dongles)
}

// createDongle 创建 Dongle 设备
func (r *Router) createDongle(c *gin.Context) {
	deviceMutex.Lock()
	defer deviceMutex.Unlock()

	var req DongleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 设置默认值
	if req.Device == "" {
		req.Device = "/dev/ttyUSB0"
	}
	if req.Audio == "" {
		req.Audio = "/dev/ttyUSB1"
	}
	if req.Data == "" {
		req.Data = "/dev/ttyUSB2"
	}
	if req.Group == 0 {
		req.Group = 0
	}
	if req.Context == "" {
		req.Context = "quectel-incoming"
	}
	if req.DialPrefix == "" {
		req.DialPrefix = "999"
	}

	dongle := database.Dongle{
		DeviceID:   req.DeviceID,
		Device:     req.Device,
		Audio:      req.Audio,
		Data:       req.Data,
		Group:      req.Group,
		Context:    req.Context,
		DialPrefix: req.DialPrefix,
		Disable:    req.Disable,
	}

	if err := database.DB.Create(&dongle).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dongle)
}

// getDongle 获取单个 Dongle 详情（含 SIM 信息）
func (r *Router) getDongle(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var dongle database.Dongle
	if err := database.DB.First(&dongle, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dongle not found"})
		return
	}

	// TODO: 通过 AMI 获取 SIM 信息
	// amiManager := ami.GetManager()
	// if status := amiManager.GetDongleStatus(dongle.DeviceID); status != nil {
	// 	dongle.IMEI = status.IMEI
	// 	dongle.IMSI = status.IMSI
	// 	dongle.Operator = status.Operator
	// 	dongle.SignalStrength = status.SignalStrength
	// 	dongle.Status = status.Status
	// }

	c.JSON(http.StatusOK, dongle)
}

// updateDongle 更新 Dongle 设备
func (r *Router) updateDongle(c *gin.Context) {
	deviceMutex.Lock()
	defer deviceMutex.Unlock()

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var dongle database.Dongle
	if err := database.DB.First(&dongle, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dongle not found"})
		return
	}

	var req DongleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 更新字段
	dongle.Device = req.Device
	dongle.Audio = req.Audio
	dongle.Data = req.Data
	dongle.Group = req.Group
	dongle.Context = req.Context
	dongle.DialPrefix = req.DialPrefix
	dongle.Disable = req.Disable

	if err := database.DB.Save(&dongle).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, dongle)
}

// deleteDongle 删除 Dongle 设备
func (r *Router) deleteDongle(c *gin.Context) {
	deviceMutex.Lock()
	defer deviceMutex.Unlock()

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// 先获取 Dongle 记录
	var dongle database.Dongle
	if err := database.DB.First(&dongle, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dongle not found"})
		return
	}

	// 检查是否有绑定关系（使用 device_id 字段）
	var bindingCount int64
	if err := database.DB.Model(&database.DongleBinding{}).Where("dongle_id = ?", dongle.DeviceID).Count(&bindingCount).Error; err == nil && bindingCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Cannot delete dongle with active bindings"})
		return
	}

	if err := database.DB.Delete(&dongle).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新渲染配置文件并 reload
	if err := r.reloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload config: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
