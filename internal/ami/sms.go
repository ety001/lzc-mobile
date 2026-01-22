package ami

import (
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// SMSInfo SIM 卡短信信息
type SMSInfo struct {
	Index     int    // 短信索引（从1开始）
	Status    string // 状态：REC READ/REC UNREAD/STO SENT/STO UNSENT
	Sender    string // 发送者号码
	Timestamp string // 时间戳（原始格式，如 "25/01/22 13:53:08+32"）
	Content   string // 短信内容
}

// parseCMGL 解析 AT+CMGL 命令的输出
// 输入格式示例：
// +CMGL: 1,"REC READ","+861790013744",,"25/01/22 13:53:08+32"
// Test message
// +CMGL: 2,"REC READ","10010",,"25/01/22 13:50:00+32"
// Another message
func parseCMGL(output string) []SMSInfo {
	smsList := []SMSInfo{}

	// 按行分割
	lines := strings.Split(output, "\n")

	var currentSMS *SMSInfo

	// 正则表达式匹配 CMGL 行
	// 格式：+CMGL: <index>,"<status>","<sender>",,"<timestamp>"
	cmglRegex := regexp.MustCompile(`\+CMGL:\s*(\d+),"([^"]+)","([^"]*)",*"([^"]*)"`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// 检查是否是 CMGL 行
		if matches := cmglRegex.FindStringSubmatch(line); matches != nil {
			// 解析索引
			index, _ := strconv.Atoi(matches[1])

			// 创建新的短信信息
			currentSMS = &SMSInfo{
				Index:     index,
				Status:    matches[2],
				Sender:    matches[3],
				Timestamp: matches[4],
			}
		} else if currentSMS != nil {
			// 这是短信内容行
			currentSMS.Content = line
			smsList = append(smsList, *currentSMS)
			currentSMS = nil
		}
	}

	return smsList
}

// MatchSMS 匹配短信（通过发送者、时间和内容）
// sender: 发送者号码
// timestamp: SIM卡时间戳（格式："25/01/22 13:53:08"）
// content: 短信内容
// smsList: SIM卡中的短信列表
// 返回匹配的短信索引，如果没有匹配返回0
func MatchSMS(sender, timestamp, content string, smsList []SMSInfo) int {
	// 清理内容中的特殊字符
	cleanContent := strings.ReplaceAll(content, "\r", " ")
	cleanContent = strings.ReplaceAll(cleanContent, "\n", " ")

	// 解析目标时间戳
	var targetTime time.Time
	var err error
	if timestamp != "" {
		// SIM 卡时间戳格式: "YY/MM/DD HH:MM:SS"
		// 例如: "25/01/22 13:53:08"
		targetTime, err = time.Parse("06/01/02 15:04:05", timestamp)
		if err != nil {
			// 时间解析失败，只匹配发送者和内容
			log.Printf("[SMS] Failed to parse timestamp '%s': %v, matching by sender and content only", timestamp, err)
			targetTime = time.Time{}
		} else {
			// 转换为 2000 年代
			targetTime = targetTime.AddDate(2000, 0, 0)
		}
	}

	for _, sms := range smsList {
		// 1. 匹配发送者
		if sms.Sender != sender {
			continue
		}

		// 2. 清理短信内容
		cleanSMSContent := strings.ReplaceAll(sms.Content, "\r", " ")
		cleanSMSContent = strings.ReplaceAll(cleanSMSContent, "\n", " ")

		// 3. 匹配内容
		if cleanSMSContent != cleanContent {
			continue
		}

		// 4. 如果时间戳有效，匹配时间
		if !targetTime.IsZero() && sms.Timestamp != "" {
			// 解析短信时间戳
			smsTimeStr := strings.Split(sms.Timestamp, "+")[0]
			smsTime, err := time.Parse("06/01/02 15:04:05", smsTimeStr)
			if err == nil {
				smsTime = smsTime.AddDate(2000, 0, 0)

				// 计算时间差（允许5分钟误差）
				diff := targetTime.Sub(smsTime)
				if diff < 0 {
					diff = -diff
				}

				// 如果时间差超过5分钟，不匹配
				if diff > 5*time.Minute {
					log.Printf("[SMS] Timestamp mismatch: target=%s, sms=%s, diff=%v",
						targetTime.Format("15:04:05"), smsTime.Format("15:04:05"), diff)
					continue
				}
			}
		}

		// 找到匹配的短信
		log.Printf("[SMS] Matched SMS at index %d (sender: %s, timestamp: %s)", sms.Index, sms.Sender, sms.Timestamp)
		return sms.Index
	}

	log.Printf("[SMS] No matching SMS found for sender=%s, content=%q", sender, cleanContent)
	return 0
}
