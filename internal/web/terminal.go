package web

import (
	"bytes"
	"net/http"
	"os"
	"os/exec"
	"syscall"
	"time"
	"unsafe"

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

// 终端尺寸
type Winsize struct {
	Rows    uint16
	Cols    uint16
	Xpixels uint16
	Ypixels uint16
}

// handleTerminal 处理 WebSocket 终端连接
func (r *Router) handleTerminal(c *gin.Context) {
	// 升级到 WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upgrade to WebSocket"})
		return
	}
	defer conn.Close()

	// 创建 PTY
	// 使用 /bin/ash 作为默认 shell
	cmd := exec.Command("/bin/ash")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	// 设置 PTY
	pty, err := ptyStart(cmd)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Failed to start PTY: "+err.Error()+"\r\n"))
		return
	}
	defer pty.Close()

	// 启动命令
	if err := cmd.Start(); err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Failed to start shell: "+err.Error()+"\r\n"))
		return
	}
	defer cmd.Wait()

	// 创建退出通道
	done := make(chan bool, 2)

	// 从 PTY 读取输出，发送到 WebSocket
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := pty.Read(buf)
			if err != nil {
				done <- true
				return
			}
			if n > 0 {
				if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
					done <- true
					return
				}
			}
		}
	}()

	// 从 WebSocket 读取输入，发送到 PTY
	go func() {
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				done <- true
				return
			}
			if _, err := pty.Write(data); err != nil {
				done <- true
				return
			}
		}
	}()

	// 等待任一方向完成
	<-done
}

// ptyStart 启动命令并返回 PTY
func ptyStart(cmd *exec.Cmd) (*os.File, error) {
	pty, err := openPTY()
	if err != nil {
		return nil, err
	}

	cmd.Stdin = pty
	cmd.Stdout = pty
	cmd.Stderr = pty
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
	}

	if err := cmd.Start(); err != nil {
		pty.Close()
		return nil, err
	}

	return pty, nil
}

// openPTY 打开一个新的 PTY
func openPTY() (*os.File, error) {
	// 使用 ptmx 打开 PTY master
	ptmx, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}

	// 解锁 slave PTY
	var unlock uintptr
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		ptmx.Fd(),
		syscall.TIOCSPTLCK,
		uintptr(unsafe.Pointer(&unlock)),
	)
	if errno != 0 {
		ptmx.Close()
		return nil, errno
	}

	// 获取 slave PTY 的文件名
	var n uint32
	_, _, errno = syscall.Syscall(
		syscall.SYS_IOCTL,
		ptmx.Fd(),
		syscall.TIOCGPTN,
		uintptr(unsafe.Pointer(&n)),
	)
	if errno != 0 {
		ptmx.Close()
		return nil, errno
	}

	// 打开 slave PTY
	var slaveName bytes.Buffer
	slaveName.WriteString("/dev/pts/")
	slaveName.WriteString(string(rune('0' + n)))

	pts, err := os.OpenFile(slaveName.String(), os.O_RDWR, 0)
	if err != nil {
		ptmx.Close()
		return nil, err
	}

	// 在 Linux 上，我们只需要 master PTY
	// slave PTY 会被子进程自动打开
	pts.Close()

	return ptmx, nil
}
