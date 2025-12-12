# 懒猫通信 (LZC Mobile)

欢迎使用懒猫通信（LZC Mobile）！

这是一个基于 Golang 的简易 FreePBX 系统，提供 Web 管理界面，让您无需学习复杂的 Asterisk 配置即可管理 USB dongle、SIP 客户端和短信通知。

## 主要功能

- 📱 **USB Dongle 管理**：配置和管理 GSM Modem，支持收发短信和接打电话
- 📞 **SIP 客户端支持**：管理 SIP extension，支持第三方 SIP 客户端（如 MizuDroid）注册
- 📨 **多通道通知**：短信转发到邮件、Slack、Telegram 或 Webhook（支持多选）
- 🎛️ **Web 管理面板**：友好的 Web 界面，无需手动编辑配置文件
- 📊 **实时监控**：查看 Asterisk 状态和日志，方便调试

## 快速开始

### 前置要求

- Docker 和 Docker Compose
- USB dongle（GSM Modem）设备
- OIDC 认证服务器配置信息

### 环境变量配置

启动前需要配置以下环境变量：

**OIDC 配置（必须）**：
```bash
LAZYCAT_AUTH_OIDC_CLIENT_ID=your_client_id
LAZYCAT_AUTH_OIDC_CLIENT_SECRET=your_client_secret
LAZYCAT_AUTH_OIDC_AUTH_URI=https://your-domain/sys/oauth/auth
LAZYCAT_AUTH_OIDC_TOKEN_URI=https://your-domain/sys/oauth/token
LAZYCAT_AUTH_OIDC_USERINFO_URI=https://your-domain/sys/oauth/userinfo
```

**AMI 配置（必须）**：
```bash
ASTERISK_AMI_USERNAME=admin
ASTERISK_AMI_PASSWORD=your_password
```

**可选配置**：
```bash
WEB_PORT=8071  # Web 管理端口，默认 8071
```

### 运行容器

```bash
# 构建镜像
docker build -t lzc-mobile .

# 运行容器（需要挂载 USB 设备）
docker run -d \
  --name lzc-mobile \
  --device=/dev/ttyUSB0 \
  -p 8071:8071 \
  -p 5060:5060/tcp \
  -p 40890-40900:40890-40900/udp \
  -e LAZYCAT_AUTH_OIDC_CLIENT_ID=... \
  -e LAZYCAT_AUTH_OIDC_CLIENT_SECRET=... \
  -e LAZYCAT_AUTH_OIDC_AUTH_URI=... \
  -e LAZYCAT_AUTH_OIDC_TOKEN_URI=... \
  -e LAZYCAT_AUTH_OIDC_USERINFO_URI=... \
  -e ASTERISK_AMI_USERNAME=admin \
  -e ASTERISK_AMI_PASSWORD=your_password \
  lzc-mobile
```

### 访问管理面板

打开浏览器访问：`http://localhost:8071`

使用 OIDC 账号登录后即可开始配置。

## 文档索引

详细的文档请查看 `docs/` 目录：

- [项目架构规划](docs/plan.md) - 完整的项目架构和设计文档
- [部署文档](docs/deployment.md) - 详细的部署说明（待编写）
- [使用说明](docs/usage.md) - 功能使用指南（待编写）

## 技术栈

- **后端**：Go + Gin
- **前端**：Vite + React + Tailwind CSS
- **数据库**：SQLite
- **PBX**：Asterisk + chan_dongle
- **进程管理**：Supervisor
- **容器化**：Docker

## 开发状态

项目正在开发中，当前版本为初始版本。

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 许可证。

## 贡献

欢迎提交 Issue 和 Pull Request！

