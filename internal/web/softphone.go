package web

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/ety001/lzc-mobile/internal/database"
	"github.com/ety001/lzc-mobile/internal/softphone"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// handleSoftphoneWS is the production Softphone control+media WebSocket (443-only).
func (r *Router) handleSoftphoneWS(c *gin.Context) {
	mgr := softphone.GetManager()
	status := mgr.Status()
	if !status.Configured {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Softphone extension not configured. Set it in Settings first."})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[softphone] upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	client := mgr.AttachClient(conn)
	defer mgr.DetachClient(client)

	conn.SetReadLimit(64 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(120 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(120 * time.Second))
		return nil
	})

	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(120 * time.Second))

		switch msgType {
		case websocket.TextMessage:
			var msg softphone.ControlMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			mgr.HandleControl(client, msg)
		case websocket.BinaryMessage:
			frame, err := softphone.DecodeFrame(data)
			if err != nil {
				continue
			}
			if frame.Codec != softphone.CodecPCM16LE8k {
				continue
			}
			mgr.PushPCM(frame.Payload)
		}
	}
}

// handleSoftphoneEchoWS is Spike A: PCM echo over WSS for latency measurement.
func (r *Router) handleSoftphoneEchoWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[softphone-echo] upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("[softphone-echo] client connected")
	conn.SetReadLimit(64 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(120 * time.Second))

	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(120 * time.Second))
		if msgType != websocket.BinaryMessage {
			continue
		}
		// Echo binary frames as-is (keeps client ts_ms for RTT measurement).
		_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		if err := conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
			return
		}
	}
}

// getSoftphoneStatus returns UA registration / config status.
func (r *Router) getSoftphoneStatus(c *gin.Context) {
	c.JSON(http.StatusOK, softphone.GetManager().Status())
}

// ReloadSoftphone applies GlobalConfig.SoftphoneExtensionID to the UA.
func ReloadSoftphone() {
	reloadSoftphoneFromDB()
}

// reloadSoftphoneFromDB applies GlobalConfig.SoftphoneExtensionID to the UA.
func reloadSoftphoneFromDB() {
	var cfg database.GlobalConfig
	if err := database.DB.FirstOrCreate(&cfg, database.GlobalConfig{ID: 1}).Error; err != nil {
		log.Printf("[softphone] load config: %v", err)
		return
	}

	profile := cfg.AudioABProfile
	if profile != "B" {
		profile = "A"
	}
	softphone.GetManager().SetAudioABProfile(profile)

	var sipPort int
	var sip database.SIPConfig
	if err := database.DB.First(&sip).Error; err == nil {
		sipPort = sip.Port
	}

	if cfg.SoftphoneExtensionID == nil || *cfg.SoftphoneExtensionID == 0 {
		_ = softphone.GetManager().ConfigureAndStart(nil, "", "", sipPort)
		return
	}

	var ext database.Extension
	if err := database.DB.First(&ext, *cfg.SoftphoneExtensionID).Error; err != nil {
		log.Printf("[softphone] extension %d not found: %v", *cfg.SoftphoneExtensionID, err)
		_ = softphone.GetManager().ConfigureAndStart(nil, "", "", sipPort)
		return
	}

	id := ext.ID
	if err := softphone.GetManager().ConfigureAndStart(&id, ext.Username, ext.Secret, sipPort); err != nil {
		log.Printf("[softphone] start failed: %v", err)
	}
}
