package main

import (
	"bufio"
	"crypto/md5"
	"flag"
	"fmt"
	"log"
	"net"
	"strings"
	"time"
)

func main() {
	var (
		username = flag.String("username", "101", "SIP username")
		password = flag.String("password", "123456", "SIP password")
		server   = flag.String("server", "192.168.199.11", "SIP server address")
		port     = flag.Int("port", 5060, "SIP server port")
	)
	flag.Parse()

	log.Printf("Testing SIP registration...")
	log.Printf("  Username: %s", *username)
	log.Printf("  Password: %s", *password)
	log.Printf("  Server: %s:%d", *server, *port)

	// 连接到 SIP 服务器
	addr := fmt.Sprintf("%s:%d", *server, *port)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		log.Fatalf("Failed to connect to SIP server: %v", err)
	}
	defer conn.Close()

	// 生成 Call-ID 和 Tag
	callID := fmt.Sprintf("%x", time.Now().UnixNano())
	fromTag := fmt.Sprintf("%x", time.Now().UnixNano())
	branch := fmt.Sprintf("z9hG4bK%x", time.Now().UnixNano())

	// 构建 REGISTER 请求
	registerRequest := fmt.Sprintf(
		"REGISTER sip:%s SIP/2.0\r\n"+
			"Via: SIP/2.0/TCP 127.0.0.1:5060;branch=%s;rport\r\n"+
			"From: <sip:%s@%s>;tag=%s\r\n"+
			"To: <sip:%s@%s>\r\n"+
			"Call-ID: %s\r\n"+
			"CSeq: 1 REGISTER\r\n"+
			"Contact: <sip:%s@127.0.0.1:5060>\r\n"+
			"Max-Forwards: 70\r\n"+
			"User-Agent: Test-SIP-Client/1.0\r\n"+
			"Content-Length: 0\r\n"+
			"\r\n",
		*server, branch, *username, *server, fromTag, *username, *server, callID, *username)

	log.Println("Sending REGISTER request...")
	log.Println("Request:")
	fmt.Println(registerRequest)

	// 发送请求
	_, err = conn.Write([]byte(registerRequest))
	if err != nil {
		log.Fatalf("Failed to send REGISTER request: %v", err)
	}

	// 读取响应
	reader := bufio.NewReader(conn)
	response, err := reader.ReadString('\n')
	if err != nil {
		log.Fatalf("Failed to read response: %v", err)
	}

	log.Println("Response:")
	fmt.Println(response)

	// 读取完整的响应头
	var responseHeaders strings.Builder
	responseHeaders.WriteString(response)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		responseHeaders.WriteString(line)
		if line == "\r\n" || line == "\n" {
			break
		}
	}

	fullResponse := responseHeaders.String()
	log.Println("Full response:")
	fmt.Println(fullResponse)

	// 解析状态码
	if strings.Contains(response, "401") || strings.Contains(response, "407") {
		log.Println("Received 401/407 (Unauthorized), extracting challenge...")
		
		// 提取 WWW-Authenticate 头
		wwwAuth := extractHeader(fullResponse, "WWW-Authenticate")
		if wwwAuth == "" {
			wwwAuth = extractHeader(fullResponse, "Proxy-Authenticate")
		}
		
		if wwwAuth == "" {
			log.Fatalf("No WWW-Authenticate header found in response")
		}
		
		log.Printf("WWW-Authenticate: %s", wwwAuth)
		
		// 解析 realm 和 nonce
		realm := extractParam(wwwAuth, "realm")
		nonce := extractParam(wwwAuth, "nonce")
		
		if realm == "" || nonce == "" {
			log.Fatalf("Failed to extract realm or nonce from challenge")
		}
		
		log.Printf("Realm: %s", realm)
		log.Printf("Nonce: %s", nonce)
		
		// 计算 MD5 响应
		// HA1 = MD5(username:realm:password)
		ha1 := fmt.Sprintf("%x", md5.Sum([]byte(fmt.Sprintf("%s:%s:%s", *username, realm, *password))))
		// HA2 = MD5(method:uri)
		uri := fmt.Sprintf("sip:%s", *server)
		ha2 := fmt.Sprintf("%x", md5.Sum([]byte(fmt.Sprintf("REGISTER:%s", uri))))
		// Response = MD5(HA1:nonce:HA2)
		response := fmt.Sprintf("%x", md5.Sum([]byte(fmt.Sprintf("%s:%s:%s", ha1, nonce, ha2))))
		
		log.Printf("HA1: %s", ha1)
		log.Printf("HA2: %s", ha2)
		log.Printf("Response: %s", response)
		
		// 构建带认证的 REGISTER 请求
		authHeader := fmt.Sprintf(
			"Authorization: Digest username=\"%s\", realm=\"%s\", nonce=\"%s\", uri=\"%s\", response=\"%s\"\r\n",
			*username, realm, nonce, uri, response)
		
		registerRequestAuth := fmt.Sprintf(
			"REGISTER sip:%s SIP/2.0\r\n"+
				"Via: SIP/2.0/TCP 127.0.0.1:5060;branch=%s;rport\r\n"+
				"From: <sip:%s@%s>;tag=%s\r\n"+
				"To: <sip:%s@%s>\r\n"+
				"Call-ID: %s\r\n"+
				"CSeq: 2 REGISTER\r\n"+
				"Contact: <sip:%s@127.0.0.1:5060>\r\n"+
				"Max-Forwards: 70\r\n"+
				"User-Agent: Test-SIP-Client/1.0\r\n"+
				"%s"+
				"Content-Length: 0\r\n"+
				"\r\n",
			*server, branch, *username, *server, fromTag, *username, *server, callID, *username, authHeader)
		
		log.Println("\nSending authenticated REGISTER request...")
		log.Println("Request:")
		fmt.Println(registerRequestAuth)
		
		// 发送认证请求
		_, err = conn.Write([]byte(registerRequestAuth))
		if err != nil {
			log.Fatalf("Failed to send authenticated REGISTER request: %v", err)
		}
		
		// 读取最终响应（可能需要读取多个消息，找到 REGISTER 响应）
		reader = bufio.NewReader(conn)
		var finalResponse string
		var finalResponseHeaders strings.Builder
		
		// 读取多个消息，找到 REGISTER 响应
		for i := 0; i < 10; i++ {
			line, err := reader.ReadString('\n')
			if err != nil {
				break
			}
			
			// 检查是否是 SIP 响应（以 SIP/2.0 开头）
			if strings.HasPrefix(line, "SIP/2.0") {
				finalResponse = line
				finalResponseHeaders.WriteString(line)
				
				// 读取完整的响应头
				for {
					line, err := reader.ReadString('\n')
					if err != nil {
						break
					}
					finalResponseHeaders.WriteString(line)
					if line == "\r\n" || line == "\n" {
						break
					}
				}
				
				// 检查是否是 REGISTER 响应（通过 CSeq 检查）
				responseText := finalResponseHeaders.String()
				if strings.Contains(responseText, "CSeq: 2 REGISTER") || strings.Contains(responseText, "CSeq: 2 REGISTER") {
					log.Println("Found REGISTER response:")
					fmt.Println(responseText)
					break
				} else {
					// 不是我们要找的响应，继续读取
					finalResponseHeaders.Reset()
					continue
				}
			} else if strings.HasPrefix(line, "REGISTER") || strings.HasPrefix(line, "OPTIONS") || strings.HasPrefix(line, "INVITE") {
				// 这是请求，不是响应，跳过
				// 读取到空行为止
				for {
					line, err := reader.ReadString('\n')
					if err != nil || line == "\r\n" || line == "\n" {
						break
					}
				}
				continue
			}
		}
		
		if finalResponseHeaders.Len() > 0 {
			log.Println("Final response:")
			fmt.Println(finalResponseHeaders.String())
			
			responseText := finalResponseHeaders.String()
			if strings.Contains(responseText, "200 OK") {
				log.Println("✓ Registration successful!")
			} else if strings.Contains(responseText, "403") {
				log.Println("✗ Registration failed: Forbidden (wrong password?)")
			} else if strings.Contains(responseText, "401") {
				log.Println("✗ Registration failed: Unauthorized (authentication failed, wrong password?)")
			} else {
				log.Printf("✗ Registration failed: %s", finalResponse)
			}
		} else {
			log.Println("✗ Failed to read REGISTER response")
		}
	} else if strings.Contains(response, "200") {
		log.Println("✓ Registration successful (no authentication required)!")
	} else {
		log.Printf("✗ Registration failed: %s", response)
	}
}

func extractHeader(response, headerName string) string {
	lines := strings.Split(response, "\r\n")
	for _, line := range lines {
		if strings.HasPrefix(strings.ToLower(line), strings.ToLower(headerName)+":") {
			return strings.TrimSpace(strings.TrimPrefix(line, headerName+":"))
		}
	}
	return ""
}

func extractParam(header, param string) string {
	// 移除引号
	header = strings.ReplaceAll(header, "\"", "")
	
	// 查找参数
	start := strings.Index(header, param+"=")
	if start == -1 {
		return ""
	}
	
	start += len(param) + 1
	end := start
	for end < len(header) && header[end] != ',' && header[end] != ' ' {
		end++
	}
	
	return strings.TrimSpace(header[start:end])
}
