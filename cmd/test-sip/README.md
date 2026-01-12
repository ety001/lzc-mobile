# SIP 注册测试工具

这是一个简单的 SIP 注册测试工具，用于测试 extension 的登录功能。

## 使用方法

### 在本地编译并运行

```bash
# 编译（静态链接，适用于容器环境）
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o test-sip cmd/test-sip/main.go

# 运行测试
./test-sip -username 101 -password 123456 -server 192.168.199.11 -port 5060
```

### 在容器内运行

```bash
# 1. 编译静态链接的二进制文件
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o test-sip cmd/test-sip/main.go

# 2. 复制到服务器
scp test-sip ety001@192.168.199.11:/tmp/

# 3. 复制到容器
ssh ety001@192.168.199.11 "docker cp /tmp/test-sip lzc-mobile:/tmp/test-sip"

# 4. 在容器内运行（等待 Asterisk 完全启动后）
ssh ety001@192.168.199.11 "docker exec lzc-mobile /tmp/test-sip -username 101 -password 123456 -server 127.0.0.1 -port 5060"
```

## 参数说明

- `-username`: SIP 用户名（默认: 101）
- `-password`: SIP 密码（默认: 123456）
- `-server`: SIP 服务器地址（默认: 192.168.199.11）
- `-port`: SIP 服务器端口（默认: 5060）

## 输出说明

- `✓ Registration successful!`: 注册成功
- `✗ Registration failed: Authentication failed (wrong password?)`: 认证失败，可能是密码错误
- `✗ Registration failed: Forbidden (wrong password?)`: 禁止访问，可能是密码错误或用户不存在
