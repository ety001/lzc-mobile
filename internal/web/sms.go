package web

import (
	"log"
	"net/http"
	"strconv"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/ety001/lzc-mobile/internal/at"
	"github.com/ety001/lzc-mobile/internal/database"
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

// deleteSMSMessage 删除 SMS 消息
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

	// 如果是 inbound 短信,先尝试从 SIM 卡删除
	if message.Direction == "inbound" {
		devicePort, err := at.GetDevicePort(message.DongleID)
		if err == nil {
			// 成功获取端口,尝试删除 SIM 卡中的短信
			executor := at.NewCommandExecutor(devicePort)
			if message.SMSIndex > 0 {
				// 有索引,直接删除
				if err := executor.DeleteSMS(message.SMSIndex, 1); err != nil {
					log.Printf("Warning: Failed to delete SMS from SIM card (index %d): %v", message.SMSIndex, err)
				} else {
					log.Printf("[SMS] Successfully deleted SMS from SIM card: index=%d, dongle=%s", message.SMSIndex, message.DongleID)
				}
			} else {
				// 没有索引,尝试通过内容匹配删除
				messages, err := executor.ListSMS()
				if err == nil {
					for _, msg := range messages {
						if msg["number"] == message.PhoneNumber && msg["content"] == message.Content {
							if idx, err := strconv.Atoi(msg["index"]); err == nil && idx > 0 {
								if err := executor.DeleteSMS(idx, 1); err != nil {
									log.Printf("Warning: Failed to delete SMS from SIM (matched index %d): %v", idx, err)
								} else {
									log.Printf("[SMS] Successfully deleted SMS from SIM card (matched): index=%d, dongle=%s", idx, message.DongleID)
								}
								break
							}
						}
					}
				} else {
					log.Printf("Warning: Failed to list SMS from SIM: %v", err)
				}
			}
		} else {
			log.Printf("Warning: Failed to get device port for dongle %s: %v", message.DongleID, err)
		}
		// 即使 SIM 卡删除失败,也继续删除数据库记录
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
