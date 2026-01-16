package web

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// getLogs 获取最近的日志（最近 N 行）
func (r *Router) getLogs(c *gin.Context) {
	logPath := os.Getenv("ASTERISK_LOG_PATH")

	// 如果环境变量设置了但文件不存在，或者环境变量未设置，则自动检测
	if logPath != "" {
		// 检查环境变量指定的文件是否存在
		if _, err := os.Stat(logPath); os.IsNotExist(err) {
			logPath = "" // 文件不存在，重置为空，使用自动检测
		}
	}

	if logPath == "" {
		// 自动检测：按优先级检查日志文件
		// 1. messages (标准 Asterisk 日志)
		// 2. messages.log (某些配置下的文件名)
		// 3. full (Asterisk full 日志)
		candidates := []string{
			"/var/log/asterisk/messages",
			"/var/log/asterisk/messages.log",
			"/var/log/asterisk/full",
		}
		for _, candidate := range candidates {
			if _, err := os.Stat(candidate); err == nil {
				logPath = candidate
				break
			}
		}
		// 如果都不存在，默认使用 messages
		if logPath == "" {
			logPath = "/var/log/asterisk/messages"
		}
	}

	lines := 100 // 默认返回最近 100 行
	if linesParam := c.Query("lines"); linesParam != "" {
		// 解析 lines 参数
		if parsedLines, err := strconv.Atoi(linesParam); err == nil && parsedLines > 0 {
			lines = parsedLines
		}
	}

	file, err := os.Open(logPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to open log file: %s", err.Error()),
		})
		return
	}
	defer file.Close()

	// 读取文件末尾的 N 行
	var logLines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		logLines = append(logLines, scanner.Text())
		// 只保留最后 N 行
		if len(logLines) > lines {
			logLines = logLines[1:]
		}
	}

	if err := scanner.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read log file"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"lines": logLines,
		"total": len(logLines),
	})
}

// streamLogs 流式传输日志（SSE）
func (r *Router) streamLogs(c *gin.Context) {
	// 检查是否启用调试模式（asterisk -rvvvv）
	debugMode := c.Query("debug") == "true"

	if debugMode {
		r.streamDebugLogs(c)
		return
	}

	logPath := os.Getenv("ASTERISK_LOG_PATH")

	// 如果环境变量设置了但文件不存在，或者环境变量未设置，则自动检测
	if logPath != "" {
		// 检查环境变量指定的文件是否存在
		if _, err := os.Stat(logPath); os.IsNotExist(err) {
			logPath = "" // 文件不存在，重置为空，使用自动检测
		}
	}

	if logPath == "" {
		// 自动检测：按优先级检查日志文件
		// 1. messages (标准 Asterisk 日志)
		// 2. messages.log (某些配置下的文件名)
		// 3. full (Asterisk full 日志)
		candidates := []string{
			"/var/log/asterisk/messages",
			"/var/log/asterisk/messages.log",
			"/var/log/asterisk/full",
		}
		for _, candidate := range candidates {
			if _, err := os.Stat(candidate); err == nil {
				logPath = candidate
				break
			}
		}
		// 如果都不存在，默认使用 messages
		if logPath == "" {
			logPath = "/var/log/asterisk/messages"
		}
	}

	file, err := os.Open(logPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to open log file: %s", err.Error()),
		})
		return
	}
	defer file.Close()

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // 禁用 nginx 缓冲

	// 移动到文件末尾
	fileInfo, err := file.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get file info"})
		return
	}
	file.Seek(0, io.SeekEnd)
	lastPos := fileInfo.Size()

	// 使用轮询方式读取新行（简化实现）
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		// 检查客户端是否断开连接
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
			// 检查文件是否有新内容
			fileInfo, err := file.Stat()
			if err != nil {
				return
			}

			if fileInfo.Size() > lastPos {
				// 读取新内容
				file.Seek(lastPos, io.SeekStart)
				scanner := bufio.NewScanner(file)
				for scanner.Scan() {
					line := scanner.Text()
					// 发送 SSE 格式的数据
					c.Writer.WriteString("data: " + strings.ReplaceAll(line, "\n", "\\n") + "\n\n")
					c.Writer.Flush()
				}
				lastPos = fileInfo.Size()
				file.Seek(0, io.SeekEnd)
			}
		}
	}
}

// streamDebugLogs 流式传输 asterisk -rvvvv 调试日志（SSE）
func (r *Router) streamDebugLogs(c *gin.Context) {
	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // 禁用 nginx 缓冲

	// 创建 asterisk -rvvvv 命令
	cmd := exec.Command("asterisk", "-rvvvv")

	// 获取命令的标准输出管道
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		c.Writer.WriteString("data: [ERROR] Failed to create stdout pipe: " + err.Error() + "\n\n")
		c.Writer.Flush()
		return
	}

	// 获取命令的标准错误管道
	stderr, err := cmd.StderrPipe()
	if err != nil {
		c.Writer.WriteString("data: [ERROR] Failed to create stderr pipe: " + err.Error() + "\n\n")
		c.Writer.Flush()
		return
	}

	// 启动命令
	if err := cmd.Start(); err != nil {
		c.Writer.WriteString("data: [ERROR] Failed to start asterisk command: " + err.Error() + "\n\n")
		c.Writer.Flush()
		return
	}

	// 确保在客户端断开连接时停止命令
	defer func() {
		if cmd.Process != nil {
			cmd.Process.Kill()
			cmd.Wait()
		}
	}()

	// 创建一个 scanner 读取输出
	scanner := bufio.NewScanner(io.MultiReader(stdout, stderr))

	// 发送初始连接消息
	c.Writer.WriteString("data: [INFO] Debug log streaming started (asterisk -rvvvv)\n\n")
	c.Writer.Flush()

	// 持续读取并发送日志
	for {
		select {
		case <-c.Request.Context().Done():
			// 客户端断开连接
			return
		default:
			if scanner.Scan() {
				line := scanner.Text()
				// 发送 SSE 格式的数据
				c.Writer.WriteString("data: " + strings.ReplaceAll(line, "\n", "\\n") + "\n\n")
				c.Writer.Flush()
			} else {
				// 扫描结束（命令退出）
				if err := scanner.Err(); err != nil {
					c.Writer.WriteString("data: [ERROR] Scanner error: " + err.Error() + "\n\n")
					c.Writer.Flush()
				}
				return
			}
		}
	}
}
