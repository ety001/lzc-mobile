package web

import (
	"encoding/base64"
	"log"
	"net/http"
	"strconv"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/sms"
	"github.com/gin-gonic/gin"
)

// listSMSMessages 列出 SMS 消息（支持分页和过滤）
func (r *Router) listSMSMessages(c *gin.Context) {
	// 获取查询参数
	page := 1
	pageSize := 20
	dongleID := c.Query("dongle_id")
	direction := c.Query("direction") // inbound 或 outbound

	if pageStr := c.Query("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	if sizeStr := c.Query("page_size"); sizeStr != "" {
		if s, err := strconv.Atoi(sizeStr); err == nil && s > 0 && s <= 100 {
			pageSize = s
		}
	}

	// 构建查询
	query := database.DB.Model(&database.SMSMessage{})

	// 过滤条件
	if dongleID != "" {
		query = query.Where("dongle_id = ?", dongleID)
	}
	if direction != "" {
		query = query.Where("direction = ?", direction)
	}

	// 获取总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 分页查询
	var messages []database.SMSMessage
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":       messages,
		"total":      total,
		"page":       page,
		"page_size":  pageSize,
		"total_pages": (int(total) + pageSize - 1) / pageSize,
	})
}

// deleteSMSMessage 删除 SMS 消息（仅删除数据库记录）
func (r *Router) deleteSMSMessage(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var message database.SMSMessage
	if err := database.DB.First(&message, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SMS message not found"})
		return
	}

	// 从数据库删除
	if err := database.DB.Delete(&message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "SMS message deleted"})
}

// deleteSMSMessages 批量删除 SMS 消息
func (r *Router) deleteSMSMessages(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Where("id IN ?", req.IDs).Delete(&database.SMSMessage{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "SMS messages deleted"})
}

// SendSMSDirectRequest 直接发送短信请求结构（通过 dongle_id）
type SendSMSDirectRequest struct {
	DongleID string `json:"dongle_id" binding:"required"`
	Number   string `json:"number" binding:"required"`
	Message  string `json:"message" binding:"required"`
}

// sendSMSDirect 发送短信（通过 dongle_id，不需要 binding ID）
func (r *Router) sendSMSDirect(c *gin.Context) {
	var req SendSMSDirectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 通过 AMI 发送短信
	amiManager := ami.GetManager()
	if err := amiManager.SendSMS(req.DongleID, req.Number, req.Message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send SMS: " + err.Error()})
		return
	}

	// 保存发送的短信到数据库（方向为 outbound）
	smsMessage := database.SMSMessage{
		DongleID:    req.DongleID,
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

// DeleteAllSMSRequest 删除 SIM 卡所有短信请求
type DeleteAllSMSRequest struct {
	Device string `json:"device" binding:"required"` // 设备名（如 quectel0）
}

// deleteAllSMSFromSIM 删除 SIM 卡中的所有短信
func (r *Router) deleteAllSMSFromSIM(c *gin.Context) {
	var req DeleteAllSMSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 通过 AMI 删除 SIM 卡中的所有短信
	amiManager := ami.GetManager()
	client := amiManager.GetClient()
	if client == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AMI client not available"})
		return
	}

	if err := client.DeleteAllSMS(req.Device); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete SMS from SIM card: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "All SMS deleted from SIM card successfully"})
}

// ReceiveSMSRequest 接收 SMS 请求结构（从 Asterisk 调用）
type ReceiveSMSRequest struct {
	Device    string `json:"device" binding:"required"`     // 设备名（如 quectel0）
	Sender    string `json:"sender" binding:"required"`     // 发送者号码
	Message   string `json:"message" binding:"required"`    // 短信内容（Base64 编码）
	Timestamp string `json:"timestamp"`                     // 时间戳（可选）
	SMSIndex  int    `json:"sms_index"`                     // SMS 索引（可选）
}

// receiveSMS 接收 SMS（从 Asterisk 内部调用，不需要认证）
func (r *Router) receiveSMS(c *gin.Context) {
	var req ReceiveSMSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 解码 Base64 消息
	messageBytes, err := base64.StdEncoding.DecodeString(req.Message)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Base64 message: " + err.Error()})
		return
	}
	message := string(messageBytes)

	// 创建 SMS handler 并处理短信
	smsHandler := sms.NewHandler()
	smsHandler.Register() // 注册到 AMI manager，以便可以获取 AMI client 来删除短信
	smsHandler.OnSMSReceivedWithIndex(req.Device, req.Sender, message, req.Timestamp, req.SMSIndex)

	c.JSON(http.StatusOK, gin.H{"message": "SMS received and queued for processing"})
}
