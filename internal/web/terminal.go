package web

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/creack/pty"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// WebSocket 升级器
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO: 在生产环境应该验证 origin
	},
	HandshakeTimeout: 10 * time.Second,
}

// handleTerminal 处理 WebSocket 终端连接
func (r *Router) handleTerminal(c *gin.Context) {
	// 升级到 WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[TERMINAL] WebSocket upgrade failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upgrade to WebSocket"})
		return
	}
	defer conn.Close()

	log.Printf("[TERMINAL] WebSocket connection established")

	// 从 URL 参数获取 shell 路径，默认为 /bin/ash
	shellPath := c.DefaultQuery("shell", "/bin/ash")
	log.Printf("[TERMINAL] Shell path: %s", shellPath)

	// 检查 shell 是否存在
	if _, err := os.Stat(shellPath); os.IsNotExist(err) {
		log.Printf("[TERMINAL] Shell not found: %s", shellPath)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: Shell not found: "+shellPath+"\r\n"))
		return
	}

	// 创建 PTY
	// 使用 /bin/bash --login 或者 /bin/ash 作为默认 shell
	// 添加 -i（交互式）和 -l（login shell）参数
	cmd := exec.Command(shellPath, "-i", "-l")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	cmd.Env = append(cmd.Env, "HOME=/root")
	cmd.Env = append(cmd.Env, "USER=root")
	cmd.Env = append(cmd.Env, "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
	cmd.Env = append(cmd.Env, "LANG=C.UTF-8")
	cmd.Env = append(cmd.Env, "LC_ALL=C.UTF-8")
	cmd.Env = append(cmd.Env, "LINES=24")
	cmd.Env = append(cmd.Env, "COLUMNS=80")
	cmd.Dir = "/app"

	log.Printf("[TERMINAL] Starting shell: %s -i -l", shellPath)

	// 启动 PTY
	ptyFile, err := pty.Start(cmd)
	if err != nil {
		log.Printf("[TERMINAL] Failed to start PTY: %v", err)
		conn.WriteMessage(websocket.TextMessage, []byte("Failed to start PTY: "+err.Error()+"\r\n"))
		return
	}
	defer ptyFile.Close()

	// 设置 PTY 初始大小
	winsize := &pty.Winsize{
		Rows: 24,
		Cols: 80,
	}
	if err := pty.Setsize(ptyFile, winsize); err != nil {
		log.Printf("[TERMINAL] Failed to set PTY size: %v", err)
	} else {
		log.Printf("[TERMINAL] PTY size set to %dx%d", winsize.Cols, winsize.Rows)
	}

	log.Printf("[TERMINAL] PTY started successfully")

	// 等待命令结束（在 goroutine 中，避免阻塞）
	go func() {
		err := cmd.Wait()
		log.Printf("[TERMINAL] Shell exited: %v", err)
	}()

	// 创建退出通道
	done := make(chan bool, 2)

	// 从 PTY 读取输出，发送到 WebSocket
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := ptyFile.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("[TERMINAL] PTY read error: %v", err)
				} else {
					log.Printf("[TERMINAL] PTY EOF")
				}
				done <- true
				return
			}
			if n > 0 {
				log.Printf("[TERMINAL] PTY→WS: %q (hex: %x, len: %d)", string(buf[:n]), buf[:n], n)
				if err := conn.WriteMessage(websocket.TextMessage, buf[:n]); err != nil {
					log.Printf("[TERMINAL] WebSocket write error: %v", err)
					done <- true
					return
				}
			}
		}
	}()

	// 从 WebSocket 读取输入，发送到 PTY
	go func() {
		for {
			messageType, data, err := conn.ReadMessage()
			if err != nil {
				log.Printf("[TERMINAL] WebSocket read error: %v", err)
				done <- true
				return
			}

			// 检查是否是 JSON 控制消息（如 resize）
			if messageType == websocket.TextMessage {
				var msg map[string]interface{}
				if err := json.Unmarshal(data, &msg); err == nil {
					if msgType, ok := msg["type"].(string); ok && msgType == "resize" {
						if cols, ok := msg["cols"].(float64); ok {
							if rows, ok := msg["rows"].(float64); ok {
								winsize := &pty.Winsize{
									Rows: uint16(rows),
									Cols: uint16(cols),
								}
								if err := pty.Setsize(ptyFile, winsize); err != nil {
									log.Printf("[TERMINAL] Failed to set PTY size: %v", err)
								} else {
									log.Printf("[TERMINAL] PTY resized to %dx%d", uint16(cols), uint16(rows))
								}
								continue
							}
						}
					}
				}
			}

			// 普通输入数据，发送到 PTY
			log.Printf("[TERMINAL] WS→PTY: %q (hex: %x, len: %d)", string(data), data, len(data))
			if _, err := ptyFile.Write(data); err != nil {
				log.Printf("[TERMINAL] PTY write error: %v", err)
				done <- true
				return
			}
			log.Printf("[TERMINAL] Wrote %d bytes to PTY", len(data))
		}
	}()

	// 等待任一方向完成
	log.Printf("[TERMINAL] Waiting for completion...")
	<-done
	log.Printf("[TERMINAL] Connection closing")
}
