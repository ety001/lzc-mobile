package at

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"go.bug.st/serial"
)

// CommandExecutor AT 命令执行器
type CommandExecutor struct {
	devicePort string // 例如: /dev/ttyUSB2
}

// NewCommandExecutor 创建 AT 命令执行器
func NewCommandExecutor(devicePort string) *CommandExecutor {
	return &CommandExecutor{
		devicePort: devicePort,
	}
}

// ExecuteCommand 执行 AT 命令
func (e *CommandExecutor) ExecuteCommand(command string, timeout time.Duration) (string, error) {
	mode := &serial.Mode{
		BaudRate: 115200,
	}

	port, err := serial.Open(e.devicePort, mode)
	if err != nil {
		return "", fmt.Errorf("failed to open serial port: %w", err)
	}
	defer port.Close()

	// 发送命令
	cmd := command + "\r"
	if _, err := port.Write([]byte(cmd)); err != nil {
		return "", fmt.Errorf("failed to write command: %w", err)
	}

	// 读取响应
	buffer := make([]byte, 4096)
	response := strings.Builder{}
	startTime := time.Now()

	for time.Since(startTime) < timeout {
		n, err := port.Read(buffer)
		if err != nil {
			break
		}
		if n > 0 {
			response.Write(buffer[:n])
			// 检查是否收到 OK 或 ERROR
			resp := response.String()
			if strings.Contains(resp, "OK") || strings.Contains(resp, "ERROR") {
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	return response.String(), nil
}

// DeleteSMS 删除 SIM 卡中的短信
// index: 短信索引
// deleteFlag: 删除标志 (1=已读, 2=已读+已发送, 3=已读+已发送+未发送, 4=全部)
func (e *CommandExecutor) DeleteSMS(index int, deleteFlag int) error {
	cmd := fmt.Sprintf("AT+CMGD=%d,%d", index, deleteFlag)
	resp, err := e.ExecuteCommand(cmd, 5*time.Second)
	if err != nil {
		return err
	}

	if !strings.Contains(resp, "OK") {
		return fmt.Errorf("failed to delete SMS: %s", resp)
	}

	log.Printf("[AT] SMS deleted from SIM: index=%d, device=%s", index, e.devicePort)
	return nil
}

// ListSMS 列出 SIM 卡中的短信
func (e *CommandExecutor) ListSMS() ([]map[string]string, error) {
	cmd := "AT+CMGL=4" // 读取所有短信
	resp, err := e.ExecuteCommand(cmd, 10*time.Second)
	if err != nil {
		return nil, err
	}

	if !strings.Contains(resp, "OK") {
		return nil, fmt.Errorf("failed to list SMS: %s", resp)
	}

	// 解析响应
	lines := strings.Split(resp, "\n")
	messages := []map[string]string{}

	re := regexp.MustCompile(`\+CMGL:\s*(\d+),"([^"]+)","([^"]+)",.*?,"(.+)"`)
	for i, line := range lines {
		if matches := re.FindStringSubmatch(line); len(matches) > 0 {
			msg := map[string]string{
				"index":     matches[1],
				"status":    matches[2],
				"number":    matches[3],
				"timestamp": matches[4],
			}
			// 下一行是短信内容
			if i+1 < len(lines) {
				msg["content"] = strings.TrimSpace(lines[i+1])
			}
			messages = append(messages, msg)
		}
	}

	return messages, nil
}

// GetDevicePort 获取 dongle 对应的数据端口
// dongleID: 例如 "quectel0"
// 返回: "/dev/ttyUSB2" 或错误
func GetDevicePort(dongleID string) (string, error) {
	// 根据 dongleID 查找对应的数据端口
	// quectel0 -> /dev/ttyUSB2 (数据端口)
	// quectel1 -> /dev/ttyUSB5 (假设第二个设备)

	// 简化实现: 使用硬编码的映射关系
	// 实际应用中应该从配置或数据库中查询
	portMap := map[string]string{
		"quectel0": "/dev/ttyUSB2",
		"quectel1": "/dev/ttyUSB5",
		"quectel2": "/dev/ttyUSB8",
	}

	port, ok := portMap[dongleID]
	if !ok {
		return "", fmt.Errorf("unknown dongle ID: %s", dongleID)
	}

	return port, nil
}
