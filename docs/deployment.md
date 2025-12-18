# 部署文档

## 概述

本文档介绍如何部署懒猫通信（LZC Mobile）系统。系统使用 Docker 容器化部署，支持 USB dongle 设备挂载。

## 前置要求

- Docker 和 Docker Compose（可选）
- USB dongle（GSM Modem）设备
- OIDC 认证服务器配置信息
- Asterisk AMI 账户和密码

## 环境变量配置

### 必须的环境变量

**OIDC 配置**：
```bash
LAZYCAT_AUTH_OIDC_CLIENT_ID=your_client_id
LAZYCAT_AUTH_OIDC_CLIENT_SECRET=your_client_secret
LAZYCAT_AUTH_OIDC_AUTH_URI=https://your-domain/sys/oauth/auth
LAZYCAT_AUTH_OIDC_TOKEN_URI=https://your-domain/sys/oauth/token
LAZYCAT_AUTH_OIDC_USERINFO_URI=https://your-domain/sys/oauth/userinfo
```

**AMI 配置**：
```bash
ASTERISK_AMI_USERNAME=admin
ASTERISK_AMI_PASSWORD=your_password
```

### 可选的环境变量

```bash
# Web 管理端口（默认 8071）
WEB_PORT=8071

# 数据库文件路径（默认 /var/lib/lzc-mobile/data.db）
DB_PATH=/var/lib/lzc-mobile/data.db

# Asterisk 配置目录（默认 /etc/asterisk）
ASTERISK_CONFIG_DIR=/etc/asterisk

# Asterisk 模板目录（默认 /app/configs/asterisk）
ASTERISK_TEMPLATE_DIR=/app/configs/asterisk

# Asterisk 日志路径（默认 /var/log/asterisk/full）
ASTERISK_LOG_PATH=/var/log/asterisk/full

# AMI 主机（默认 localhost）
ASTERISK_AMI_HOST=localhost

# AMI 端口（默认 5038）
ASTERISK_AMI_PORT=5038

# OIDC 重定向 URI（默认 /auth/oidc/callback）
# 这是 OIDC 回调的相对路径，会与 LAZYCAT_AUTH_BASE_URL 组合成完整的回调地址
LAZYCAT_AUTH_OIDC_REDIRECT_URI=/auth/oidc/callback

# OIDC 基础 URL（用于构建完整的重定向 URI）
# 格式：协议://域名或IP:端口（例如：https://example.com:8071 或 http://192.168.1.100:8071）
# 此 URL 必须是从外部可访问的地址（OIDC 提供商需要能够访问此地址进行回调）
# 默认值：http://localhost:8071（仅用于本地开发）
# 生产环境必须设置为实际的外部可访问地址，否则 OIDC 认证将失败
# 完整回调地址 = LAZYCAT_AUTH_BASE_URL + LAZYCAT_AUTH_OIDC_REDIRECT_URI
# 例如：https://example.com:8071 + /auth/oidc/callback = https://example.com:8071/auth/oidc/callback
LAZYCAT_AUTH_BASE_URL=http://localhost:8071
```

## 构建 Docker 镜像

```bash
# 在项目根目录执行
docker build -f docker/Dockerfile -t lzc-mobile:latest .
```

## 运行容器

### 基本运行

```bash
docker run -d \
  --name lzc-mobile \
  --device=/dev/ttyUSB0 \
  -p 8071:8071 \
  -p 5060:5060/tcp \
  -p 40890-40900:40890-40900/udp \
  -e LAZYCAT_AUTH_OIDC_CLIENT_ID=your_client_id \
  -e LAZYCAT_AUTH_OIDC_CLIENT_SECRET=your_client_secret \
  -e LAZYCAT_AUTH_OIDC_AUTH_URI=https://your-domain/sys/oauth/auth \
  -e LAZYCAT_AUTH_OIDC_TOKEN_URI=https://your-domain/sys/oauth/token \
  -e LAZYCAT_AUTH_OIDC_USERINFO_URI=https://your-domain/sys/oauth/userinfo \
  -e ASTERISK_AMI_USERNAME=admin \
  -e ASTERISK_AMI_PASSWORD=your_password \
  lzc-mobile:latest
```

### 使用 Docker Compose（推荐）

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  lzc-mobile:
    build:
      context: .
      dockerfile: docker/Dockerfile
    container_name: lzc-mobile
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    ports:
      - "8071:8071"      # Web 管理端口
      - "5060:5060/tcp"  # SIP TCP 端口
      - "40890-40900:40890-40900/udp"  # RTP UDP 端口范围
    environment:
      # OIDC 配置
      - LAZYCAT_AUTH_OIDC_CLIENT_ID=${LAZYCAT_AUTH_OIDC_CLIENT_ID}
      - LAZYCAT_AUTH_OIDC_CLIENT_SECRET=${LAZYCAT_AUTH_OIDC_CLIENT_SECRET}
      - LAZYCAT_AUTH_OIDC_AUTH_URI=${LAZYCAT_AUTH_OIDC_AUTH_URI}
      - LAZYCAT_AUTH_OIDC_TOKEN_URI=${LAZYCAT_AUTH_OIDC_TOKEN_URI}
      - LAZYCAT_AUTH_OIDC_USERINFO_URI=${LAZYCAT_AUTH_OIDC_USERINFO_URI}
      - LAZYCAT_AUTH_BASE_URL=${LAZYCAT_AUTH_BASE_URL:-http://localhost:8071}
      # AMI 配置
      - ASTERISK_AMI_USERNAME=${ASTERISK_AMI_USERNAME}
      - ASTERISK_AMI_PASSWORD=${ASTERISK_AMI_PASSWORD}
      # 可选配置
      - WEB_PORT=${WEB_PORT:-8071}
      - DB_PATH=/var/lib/lzc-mobile/data.db
      - ASTERISK_CONFIG_DIR=/etc/asterisk
      - ASTERISK_TEMPLATE_DIR=/app/configs/asterisk
      - ASTERISK_LOG_PATH=/var/log/asterisk/full
    volumes:
      # 持久化数据库
      - lzc-mobile-data:/var/lib/lzc-mobile
      # 持久化 Asterisk 配置（可选）
      - lzc-mobile-asterisk:/etc/asterisk
      # 持久化日志（可选）
      - lzc-mobile-logs:/var/log/asterisk
    restart: unless-stopped

volumes:
  lzc-mobile-data:
  lzc-mobile-asterisk:
  lzc-mobile-logs:
```

创建 `.env` 文件（用于 Docker Compose）：

```bash
LAZYCAT_AUTH_OIDC_CLIENT_ID=your_client_id
LAZYCAT_AUTH_OIDC_CLIENT_SECRET=your_client_secret
LAZYCAT_AUTH_OIDC_AUTH_URI=https://your-domain/sys/oauth/auth
LAZYCAT_AUTH_OIDC_TOKEN_URI=https://your-domain/sys/oauth/token
LAZYCAT_AUTH_OIDC_USERINFO_URI=https://your-domain/sys/oauth/userinfo
LAZYCAT_AUTH_BASE_URL=http://localhost:8071
ASTERISK_AMI_USERNAME=admin
ASTERISK_AMI_PASSWORD=your_password
WEB_PORT=8071
```

启动服务：

```bash
docker-compose up -d
```

## USB 设备挂载

### 查找 USB 设备

```bash
# 列出所有 USB 设备
ls -l /dev/ttyUSB*

# 查看设备信息
udevadm info /dev/ttyUSB0
```

### 挂载多个 USB 设备

如果系统有多个 USB dongle，可以挂载多个设备：

```bash
docker run -d \
  --name lzc-mobile \
  --device=/dev/ttyUSB0 \
  --device=/dev/ttyUSB1 \
  ...
```

或在 Docker Compose 中：

```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
  - /dev/ttyUSB1:/dev/ttyUSB1
```

### 权限问题

如果遇到权限问题，可以：

1. 将用户添加到 `dialout` 组：
```bash
sudo usermod -a -G dialout $USER
```

2. 或者使用 `--privileged` 模式（不推荐，但可以临时使用）：
```bash
docker run --privileged ...
```

## 端口说明

- **8071/tcp**：Web 管理面板端口
- **5060/tcp**：SIP TCP 端口（可自定义）
- **40890-40900/udp**：RTP UDP 端口范围（可自定义）

## 数据持久化

建议使用 Docker volumes 持久化以下数据：

- **数据库**：`/var/lib/lzc-mobile/data.db`
- **Asterisk 配置**：`/etc/asterisk/`（可选，配置会通过模板生成）
- **日志**：`/var/log/asterisk/`（可选）

## 访问管理面板

容器启动后，访问：

```
http://localhost:8071
```

使用 OIDC 账号登录后即可开始配置。

## 故障排查

### 查看容器日志

```bash
# 查看所有日志
docker logs lzc-mobile

# 实时查看日志
docker logs -f lzc-mobile

# 查看 Supervisor 日志
docker exec lzc-mobile cat /var/log/supervisor/supervisord.log
```

### 查看 Asterisk 日志

```bash
# 进入容器
docker exec -it lzc-mobile bash

# 查看 Asterisk 日志
tail -f /var/log/asterisk/full
```

### 检查服务状态

```bash
# 进入容器
docker exec -it lzc-mobile bash

# 查看 Supervisor 状态
supervisorctl status

# 重启服务
supervisorctl restart asterisk
supervisorctl restart webpanel
```

### 常见问题

1. **USB 设备未找到**
   - 检查设备是否已连接：`ls -l /dev/ttyUSB*`
   - 检查设备权限
   - 确认设备路径正确

2. **AMI 连接失败**
   - 检查环境变量是否正确
   - 检查 Asterisk 是否正常运行
   - 查看 Asterisk 日志

3. **OIDC 登录失败**
   - 检查 OIDC 环境变量是否正确配置
   - 检查 `LAZYCAT_AUTH_BASE_URL` 是否为外部可访问的地址（不能使用 localhost）
   - 确认 `LAZYCAT_AUTH_BASE_URL` + `LAZYCAT_AUTH_OIDC_REDIRECT_URI` 组成的完整回调地址已在 OIDC 提供商处注册
   - 检查 OIDC 提供商的控制台，确认回调地址配置正确
   - 查看容器日志获取详细错误信息

## 更新部署

```bash
# 停止容器
docker stop lzc-mobile
docker rm lzc-mobile

# 重新构建镜像
docker build -f docker/Dockerfile -t lzc-mobile:latest .

# 重新启动容器
# （使用之前的 docker run 或 docker-compose 命令）
```

## 卸载

```bash
# 停止并删除容器
docker stop lzc-mobile
docker rm lzc-mobile

# 删除镜像（可选）
docker rmi lzc-mobile:latest

# 删除 volumes（可选，会删除所有数据）
docker volume rm lzc-mobile-data
docker volume rm lzc-mobile-asterisk
docker volume rm lzc-mobile-logs
```
