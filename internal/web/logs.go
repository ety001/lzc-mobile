package web

import (
	"bufio"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// getLogs 获取最近的日志（最近 N 行）
func (r *Router) getLogs(c *gin.Context) {
	logPath := os.Getenv("ASTERISK_LOG_PATH")
	if logPath == "" {
		logPath = "/var/log/asterisk/full"
	}

	lines := 100 // 默认返回最近 100 行
	if linesParam := c.Query("lines"); linesParam != "" {
		// 这里简化处理，实际应该解析 lines 参数
		// TODO: 解析 linesParam 并设置 lines
	}

	file, err := os.Open(logPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open log file"})
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
	logPath := os.Getenv("ASTERISK_LOG_PATH")
	if logPath == "" {
		logPath = "/var/log/asterisk/full"
	}

	file, err := os.Open(logPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open log file"})
		return
	}
	defer file.Close()

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	// 移动到文件末尾
	file.Seek(0, io.SeekEnd)

	// 使用 bufio.Scanner 读取新行
	scanner := bufio.NewScanner(file)
	for {
		// 检查客户端是否断开连接
		if c.Request.Context().Err() != nil {
			break
		}

		// 尝试读取新行
		if scanner.Scan() {
			line := scanner.Text()
			// 发送 SSE 格式的数据
			c.Writer.WriteString("data: " + strings.ReplaceAll(line, "\n", "\\n") + "\n\n")
			c.Writer.Flush()
		} else {
			// 如果没有新行，等待一下
			// 这里简化实现，实际应该使用 fsnotify 监听文件变化
			break
		}
	}
}
