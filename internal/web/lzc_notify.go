package web

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/lzcnotify"
	"github.com/ety001/lzc-mobile/internal/softphone"
	"github.com/gin-gonic/gin"
)

var lzcNotifySender lzcnotify.Sender

// InitLZCNotify starts LazyCat system-notification sender (best-effort).
func InitLZCNotify(ctx context.Context) {
	lzcNotifySender = lzcnotify.New(ctx)
	softphone.IncomingCallHook = sendIncomingCallNotify
}

// resolveLazycatUID prefers the platform-injected X-HC-User-ID (same as email-notify).
// OIDC "sub" is NOT the LazyCat end-device uid and yields an empty device list.
func resolveLazycatUID(c *gin.Context) string {
	if c != nil {
		if hdr := strings.TrimSpace(c.GetHeader("X-HC-User-ID")); hdr != "" {
			persistLazycatUID(hdr)
			return hdr
		}
	}
	var cfg database.GlobalConfig
	if err := database.DB.FirstOrCreate(&cfg, database.GlobalConfig{ID: 1}).Error; err == nil {
		if strings.TrimSpace(cfg.LazycatUID) != "" {
			return cfg.LazycatUID
		}
	}
	// Last resort: admin OIDC subject (often wrong for ListEndDevices).
	var admin database.AdminUser
	if err := database.DB.First(&admin).Error; err == nil {
		return admin.Subject
	}
	return ""
}

func persistLazycatUID(uid string) {
	uid = strings.TrimSpace(uid)
	if uid == "" {
		return
	}
	var cfg database.GlobalConfig
	if err := database.DB.FirstOrCreate(&cfg, database.GlobalConfig{ID: 1}).Error; err != nil {
		return
	}
	if cfg.LazycatUID == uid {
		return
	}
	old := cfg.LazycatUID
	cfg.LazycatUID = uid
	if err := database.DB.Save(&cfg).Error; err != nil {
		log.Printf("[lzcnotify] persist LazycatUID failed: %v", err)
		return
	}
	log.Printf("[lzcnotify] LazycatUID updated from %q to %q", old, uid)
	// Migrate notify settings row to the correct uid if needed.
	if old != "" && old != uid {
		_ = database.DB.Model(&database.NotifyDeviceSettings{}).
			Where("uid = ?", old).
			Update("uid", uid).Error
	}
}

func getNotifyDeviceSettings(uid string) (enabled bool, devices []string) {
	var row database.NotifyDeviceSettings
	if err := database.DB.Where("uid = ?", uid).First(&row).Error; err != nil {
		return false, nil
	}
	devices = []string{}
	if row.NotifyDevicesJSON != "" {
		_ = json.Unmarshal([]byte(row.NotifyDevicesJSON), &devices)
	}
	return row.DeviceFilterEnabled, devices
}

func sendIncomingCallNotify(from string) {
	if lzcNotifySender == nil {
		return
	}
	uid := resolveLazycatUID(nil)
	if uid == "" {
		log.Printf("[lzcnotify] skip incoming notify: no lazycat uid (open 设置→通知配置 once while logged in via LazyCat)")
		return
	}
	body := from
	if body == "" {
		body = "未知号码"
	}
	p := lzcnotify.Payload{
		Title:       "来电",
		Body:        body,
		DeeplinkURL: lzcnotify.OpenAppDeeplink("/"),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	enabled, devices := getNotifyDeviceSettings(uid)
	var err error
	if enabled {
		if dm, ok := lzcnotify.DeviceManagerOf(lzcNotifySender); ok {
			err = dm.SendToDevices(ctx, uid, devices, p)
		} else {
			err = lzcNotifySender.Send(ctx, uid, p)
		}
	} else {
		err = lzcNotifySender.Send(ctx, uid, p)
	}
	if err != nil {
		log.Printf("[lzcnotify] incoming call notify failed: %v", err)
	}
}

// getNotifyDevicesSettings GET /api/v1/settings/notify-devices
func (r *Router) getNotifyDevicesSettings(c *gin.Context) {
	uid := resolveLazycatUID(c)
	if uid == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "无法识别懒猫用户（缺少 X-HC-User-ID）"})
		return
	}
	if lzcNotifySender == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "通知服务未初始化"})
		return
	}
	dm, ok := lzcnotify.DeviceManagerOf(lzcNotifySender)
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "懒猫通知网关暂不可用，请稍后重试",
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	user, err := dm.QueryUser(ctx, uid)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	devices, err := dm.ListDevices(ctx, uid)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	unsupported := lzcnotify.UnsupportedDevicesOf(lzcNotifySender)
	for i := range devices {
		if unsupported[devices[i].ID] {
			devices[i].NotifyUnsupported = true
		}
	}

	enabled, selected := getNotifyDeviceSettings(uid)
	c.JSON(http.StatusOK, gin.H{
		"user":                    user,
		"devices":                 devices,
		"device_filter_enabled":   enabled,
		"selected_notify_devices": selected,
		"uid":                     uid,
	})
}

type notifyDevicesReq struct {
	Enabled bool     `json:"enabled"`
	Devices []string `json:"devices"`
}

// updateNotifyDevicesSettings PUT /api/v1/settings/notify-devices
func (r *Router) updateNotifyDevicesSettings(c *gin.Context) {
	uid := resolveLazycatUID(c)
	if uid == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "无法识别懒猫用户（缺少 X-HC-User-ID）"})
		return
	}
	var req notifyDevicesReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Devices == nil {
		req.Devices = []string{}
	}
	raw, _ := json.Marshal(req.Devices)

	var row database.NotifyDeviceSettings
	if err := database.DB.Where("uid = ?", uid).FirstOrCreate(&row, database.NotifyDeviceSettings{UID: uid}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	row.DeviceFilterEnabled = req.Enabled
	row.NotifyDevicesJSON = string(raw)
	if err := database.DB.Save(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// testNotifyDevices POST /api/v1/settings/notify-devices/test
func (r *Router) testNotifyDevices(c *gin.Context) {
	uid := resolveLazycatUID(c)
	if uid == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "无法识别懒猫用户（缺少 X-HC-User-ID）"})
		return
	}
	if lzcNotifySender == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "通知服务未初始化"})
		return
	}
	p := lzcnotify.Payload{
		Title:       "懒猫通讯测试通知",
		Body:        "若看到本条消息，说明客户端通知通道正常",
		DeeplinkURL: lzcnotify.OpenAppDeeplink("/"),
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	enabled, devices := getNotifyDeviceSettings(uid)
	var err error
	if enabled {
		if dm, ok := lzcnotify.DeviceManagerOf(lzcNotifySender); ok {
			err = dm.SendToDevices(ctx, uid, devices, p)
		} else {
			err = lzcNotifySender.Send(ctx, uid, p)
		}
	} else {
		err = lzcNotifySender.Send(ctx, uid, p)
	}
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
