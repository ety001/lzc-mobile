# 部署文档

## 概述

本文档介绍如何部署懒猫通信（LZC Mobile）系统。系统使用 Docker 容器化部署，支持 USB dongle 设备挂载。

## 前置要求

- Docker 和 Docker Compose
- USB dongle（GSM Modem）设备
- OIDC 认证服务器（或使用内置的 Mock OIDC 服务器进行测试）
- Asterisk AMI 账户和密码

## 快速部署

### 1. 准备配置文件

```bash
# 克隆项目或复制配置文件
git clone https://github.com/your-repo/lzc-mobile.git
cd lzc-mobile

# 复制环境变量配置
cp .env.example .env

# 编辑配置（根据实际情况修改）
vim .env
```

### 2. 启动服务

```bash
# 启动所有服务（包括 Mock OIDC）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f lzc-mobile
```

### 3. 访问管理面板

```
http://localhost:8071
```

## Docker Compose 配置说明

### docker-compose.yml

```yaml
version: '3.8'

services:
  # 测试用 Mock OIDC 服务器
  oidc-mock:
    image: ety001/lzc-mock-oidc:latest
    container_name: lzc-oidc-mock
    restart: always
    ports:
      - "7654:8080"
    environment:
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID:-test-client}
      - OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-test-client}

  # LZC Mobile 主服务
  lzc-mobile:
    image: ety001/lzc-mobile:latest
    container_name: lzc-mobile
    restart: always
    network_mode: host
    privileged: true
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
      - /dev/ttyUSB1:/dev/ttyUSB1
      - /dev/ttyUSB2:/dev/ttyUSB2
      - /dev/ttyUSB3:/dev/ttyUSB3
      - /dev/snd:/dev/snd
    environment:
      - LAZYCAT_AUTH_OIDC_CLIENT_ID=${OIDC_CLIENT_ID:-test-client}
      - LAZYCAT_AUTH_OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-test-client}
      - LAZYCAT_AUTH_OIDC_AUTH_URI=http://127.0.0.1:7654/authorize
      - LAZYCAT_AUTH_OIDC_TOKEN_URI=http://127.0.0.1:7654/token
      - LAZYCAT_AUTH_OIDC_USERINFO_URI=http://127.0.0.1:7654/userinfo
      - ASTERISK_AMI_USERNAME=${ASTERISK_AMI_USERNAME:-admin}
      - ASTERISK_AMI_PASSWORD=${ASTERISK_AMI_PASSWORD:-123456}
    volumes:
      - ./data:/var/lib/lzc-mobile
      - ./logs:/var/log/asterisk
    depends_on:
      - oidc-mock
```

### 环境变量配置 (.env)

```bash
# OIDC 配置
OIDC_CLIENT_ID=test-client
OIDC_CLIENT_SECRET=test-client

# AMI 配置
ASTERISK_AMI_USERNAME=admin
ASTERISK_AMI_PASSWORD=123456
```

## 配置参数说明

### 关键配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `network_mode: host` | 使用主机网络，简化端口配置 | - |
| `privileged: true` | 特权模式，USB 设备访问需要 | - |
| `/dev/ttyUSB*` | USB dongle 设备 | - |
| `/dev/snd` | 声卡设备（通话音频） | - |

### 环境变量

#### OIDC 认证配置

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `LAZYCAT_AUTH_OIDC_CLIENT_ID` | OIDC 客户端 ID | `test-client` |
| `LAZYCAT_AUTH_OIDC_CLIENT_SECRET` | OIDC 客户端密钥 | `test-client` |
| `LAZYCAT_AUTH_OIDC_AUTH_URI` | 授权端点 | `http://127.0.0.1:7654/authorize` |
| `LAZYCAT_AUTH_OIDC_TOKEN_URI` | Token 端点 | `http://127.0.0.1:7654/token` |
| `LAZYCAT_AUTH_OIDC_USERINFO_URI` | 用户信息端点 | `http://127.0.0.1:7654/userinfo` |

#### AMI 配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ASTERISK_AMI_USERNAME` | AMI 用户名 | `admin` |
| `ASTERISK_AMI_PASSWORD` | AMI 密码 | `123456` |
| `ASTERISK_AMI_HOST` | AMI 主机 | `localhost` |
| `ASTERISK_AMI_PORT` | AMI 端口 | `5038` |

## 数据持久化

| 路径 | 说明 |
|------|------|
| `./data` | 数据库文件存储 |
| `./logs` | Asterisk 日志 |

## 常用命令

### 服务管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看日志
docker-compose logs -f lzc-mobile
docker-compose logs -f oidc-mock
```

### 单独管理服务

```bash
# 只启动 lzc-mobile（需要先启动 oidc-mock）
docker-compose up -d oidc-mock
docker-compose up -d lzc-mobile

# 只重启 lzc-mobile
docker-compose restart lzc-mobile
```

### 进入容器调试

```bash
# 进入 lzc-mobile 容器
docker exec -it lzc-mobile sh

# 查看 Asterisk 状态
docker exec -it lzc-mobile supervisorctl status

# 重启 Asterisk
docker exec -it lzc-mobile supervisorctl restart asterisk

# 进入 Asterisk CLI
docker exec -it lzc-mobile asterisk -rvvvvv
```

## 生产环境部署

### 使用外部 OIDC 服务

修改 `.env` 文件，配置实际的 OIDC 服务：

```bash
# 生产环境 OIDC 配置
OIDC_CLIENT_ID=your-production-client-id
OIDC_CLIENT_SECRET=your-production-client-secret

# 在 docker-compose.yml 中修改 OIDC 端点
LAZYCAT_AUTH_OIDC_AUTH_URI=https://your-oidc-server/authorize
LAZYCAT_AUTH_OIDC_TOKEN_URI=https://your-oidc-server/token
LAZYCAT_AUTH_OIDC_USERINFO_URI=https://your-oidc-server/userinfo
```

然后可以移除 `oidc-mock` 服务：

```bash
# 只启动 lzc-mobile
docker-compose up -d lzc-mobile
```

### 端口说明

使用 `network_mode: host` 时，容器直接使用主机网络：

- **8071/tcp**：Web 管理面板端口
- **5060/tcp**：SIP TCP 端口
- **40890-40900/udp**：RTP UDP 端口范围
- **5038/tcp**：AMI 端口（仅本地）

## 故障排查

### 查看容器日志

```bash
# 查看所有日志
docker logs lzc-mobile

# 实时查看日志
docker logs -f --tail 100 lzc-mobile
```

### 查看 Asterisk 日志

```bash
# 进入容器查看
docker exec -it lzc-mobile tail -f /var/log/asterisk/full
```

### 检查服务状态

```bash
# 查看 Supervisor 状态
docker exec -it lzc-mobile supervisorctl status

# 输出示例：
# asterisk                         RUNNING   pid 123, uptime 1:23:45
# webpanel                         RUNNING   pid 456, uptime 1:23:45
```

### USB 设备问题

```bash
# 检查 USB 设备
ls -la /dev/ttyUSB*

# 检查设备权限
docker exec -it lzc-mobile ls -la /dev/ttyUSB*
```

### 常见问题

1. **USB 设备未找到**
   - 检查设备连接：`ls -la /dev/ttyUSB*`
   - 确认设备路径正确

2. **AMI 连接失败**
   - 检查环境变量配置
   - 确认 Asterisk 正常运行

3. **OIDC 登录失败**
   - 确认 OIDC 服务正常运行
   - 检查回调地址配置

## 更新部署

```bash
# 拉取最新镜像
docker-compose pull

# 重新启动服务
docker-compose up -d
```

## 卸载

```bash
# 停止并删除容器
docker-compose down

# 删除数据（可选）
rm -rf data logs

# 删除镜像（可选）
docker rmi ety001/lzc-mobile:latest
docker rmi ety001/lzc-mock-oidc:latest
```