# 懒猫通信 (LZC Mobile) 项目架构规划

## 项目名称
- 中文：懒猫通信
- 英文：LZC Mobile

## 项目概述

这是一个基于 Golang 的简易 FreePBX 系统，主要功能：
- 配置和管理 USB dongle（GSM Modem）
- 监听 USB dongle 收到的短信并转发到指定通知渠道（邮件/Slack/Telegram/Webhook）
- 处理 USB dongle 收到的电话，通过 SIP 客户端接收
- 通过 Web 管理面板进行配置，避免用户学习复杂的 Asterisk 配置

## TODO

- [ ] **支持驱动管理**：当前系统使用 chan_quectel 模块，未来需要支持多种驱动（如 chan_dongle）的管理和切换

## 核心结论

### 配置持久化机制
- **AMI 不持久化配置**：AMI（Asterisk Manager Interface）主要用于运行时监控和控制，动态配置不会自动保存到配置文件
- **解决方案**：Go 程序需要：
  1. 将用户配置写入 Asterisk 配置文件（文本文件，使用模板渲染）
  2. 通过 AMI 发送 `core reload` 或 `core restart` 命令使配置生效
  3. 配置会持久保存在文件中，Asterisk 重启后自动加载

### GSM Modem 管理
- 通过 `chan_dongle` 模块管理 USB dongle
- 配置在 `dongle.conf` 文件中
- 通过 AMI 监控 dongle 状态和事件（如收到短信）
- **发送短信**：Go 面板通过 AMI 命令让 Asterisk 调用 dongle 发送短信，Go 不直接与 dongle 通信

### 通知渠道
- 支持邮件、Slack、Telegram、Webhook 四种通知方式
- 允许配置多个模块同时发送通知（多选）
- SMTP 支持 SSL/TLS 加密选项
- 配置信息存储在 SQLite 数据库中

### 技术栈
- **前端**：Vite + React + Tailwind CSS
- **后端**：Go + Gin 框架
- **数据库**：SQLite
- **进程管理**：Supervisor
- **容器化**：Docker

### 认证机制
- **OIDC 认证**：必须通过环境变量提供（client_id/secret/issuer/redirect 等），否则启动失败
- 回调路径：`/auth/oidc/callback`
- 遵循文档：https://developer.lazycat.cloud/advanced-oidc.html

### 网络配置
- **SIP**：仅使用 TCP，端口可自定义，默认 5060
- **RTP**：端口段可自定义，默认 40890-40900（10 个端口）
- **Web 管理端口**：默认 8071（可配置）
- **AMI 账户/密码**：来自环境变量

### 部署要求
- Docker 镜像暴露端口：
  - SIP TCP（自定义端口，默认 5060）
  - RTP UDP（自定义范围，默认 40890-40900）
  - Web 管理端口（默认 8071）
- USB 设备访问：使用 `--device /dev/ttyUSB*` 方式，不支持 `--privileged`

## 核心模块设计

### 1. 配置管理模块
- **数据库初始化**：SQLite 种子数据包含基础 Asterisk 配置（不含 dongle/extension）
- **默认配置**：
  - SIP TCP 端口：5060
  - RTP 端口段：40890-40900
  - Web 管理端口：8071
- **配置流程**：用户表单变更 → 写入 SQLite → 渲染模板覆盖配置文件 → AMI reload

### 2. AMI 客户端模块
- **连接和鉴权**：从环境变量读取账户/密码
- **事件订阅**：监听 Asterisk 状态、短信等事件
- **命令执行**：
  - `core reload`：重新加载配置
  - `core restart now`：立即重启 Asterisk
  - dongle 相关命令（发送短信等）
- **状态上报**：将 Asterisk 状态实时推送给前端

### 3. 仪表盘与状态指示
- **导航栏状态灯**：
  - 绿色：服务正常
  - 黄色：重启中
  - 红色：服务异常
  - 鼠标悬停显示详细状态信息
- **首页展示**：
  - Asterisk 运行状态
  - 通道数、注册数等统计信息
  - "重启 Asterisk" 按钮

### 4. Extension 管理
- **CRUD 功能**：创建/修改/删除 extension
- **基础参数**：
  - username
  - secret
  - callerid
  - transport=tcp
  - host
  - context
  - port
- **配置更新**：保存后自动写入配置文件并 reload，确保第三方 SIP 客户端（如 MizuDroid）可以正确注册

### 5. Dongle 管理
- **来去电绑定**：管理页面配置 dongle 来去电与 extension 的关联关系
- **拨号计划**：自动生成相应的拨号计划配置
- **发送短信**：通过 AMI 命令让 Asterisk 调用 dongle 发送短信
- **接收短信**：监听 AMI 短信事件，转发到配置的通知渠道（多选）

### 6. 通知适配器模块
- **SMTP**：支持 SSL/TLS 加密选项
- **Slack Webhook**：通过 Webhook URL 发送消息
- **Telegram Bot API**：通过 Bot Token 发送消息
- **通用 HTTP Webhook**：支持自定义 Webhook URL
- **多选并行发送**：支持同时选择多个通知渠道

### 7. 数据库模块
- **SQLite 数据库**：存储所有配置信息
- **表结构**：
  - OIDC 配置
  - SIP 端口配置
  - RTP 端口范围配置
  - 通知渠道配置（SMTP/Slack/Telegram/Webhook）
  - Extensions
  - Dongle 绑定关系
- **迁移和种子**：提供数据库迁移脚本和初始种子数据

### 8. Web 管理面板
- **后端**：Gin 框架提供 REST API
- **前端**：Vite + React + Tailwind CSS
- **静态文件服务**：前端构建产物放在容器目录，通过 Gin 静态文件服务访问（不做 embed，不使用目录挂载）
- **配置保存**：自动触发 Asterisk reload

### 9. 认证模块
- **OIDC 登录流程**：
  - 环境变量强制要求（启动时检查）
  - 回调路径：`/auth/oidc/callback`
  - 获取 token 后创建会话
- **会话管理**：后端使用签名 cookie 管理会话
- **前端路由守卫**：未登录用户重定向到登录页

### 10. 日志页面
- **日志来源**：读取 Asterisk 日志文件（默认 `/var/log/asterisk/full` 或 `logger.conf` 指定路径）
- **展示方式**：实时流（tail -f 风格）+ 最近 N 行
- **目的**：方便调试

### 11. Supervisor 配置
- 管理 Asterisk 进程
- 管理 Go 管理面板进程

### 12. Docker 镜像
- 基于 Debian/Ubuntu 基础镜像
- 安装 Asterisk（包含 chan_dongle 模块）、Supervisor、Go 运行时
- 配置启动脚本
- 暴露必要端口
- USB 设备通过 `--device /dev/ttyUSB*` 挂载

## 项目结构

```
lzc-mobile/
├── cmd/
│   └── webpanel/              # Go 主程序 (Gin)
├── internal/
│   ├── config/                # Asterisk 配置模板渲染
│   ├── ami/                   # AMI 客户端（事件、reload/restart、dongle 命令含发短信）
│   ├── sms/                   # 短信事件处理 & 调用 AMI 发短信
│   ├── notify/                # 通知适配器（email/slack/telegram/webhook）
│   ├── auth/                  # OIDC 登录流程
│   ├── database/              # SQLite 封装、迁移/种子
│   ├── web/                   # Gin 路由、API、静态文件、日志接口
│   └── frontend/              # Vite + React + Tailwind 源码
├── configs/
│   ├── asterisk/
│   │   ├── sip.conf.tpl       # SIP 配置模板
│   │   ├── extensions.conf.tpl # 拨号计划模板
│   │   └── dongle.conf.tpl    # USB dongle 配置模板
│   └── supervisor/
│       └── supervisord.conf   # Supervisor 配置
├── docker/
│   └── Dockerfile             # Docker 镜像构建文件
├── scripts/
│   └── entrypoint.sh         # 容器启动脚本
├── migrations/               # 数据库迁移文件
├── docs/                     # 计划、任务状态、使用说明等文档
│   ├── plan.md               # 本文档
│   ├── deployment.md         # 部署文档
│   └── usage.md              # 使用说明
├── go.mod
├── go.sum
└── README.md                 # 欢迎 + 快速开始 + docs 索引
```

## 实施步骤

### 阶段一：项目初始化
1. 创建 Go 模块，配置依赖（Gin、AMI 客户端、SQLite、SMTP/HTTP 等）
2. 创建项目目录结构
3. 配置前端开发环境（Vite + React + Tailwind）

### 阶段二：数据库和配置管理
1. 设计 SQLite 数据库表结构
2. 实现数据库迁移和种子数据（包含默认配置）
3. 实现 Asterisk 配置模板（sip.conf.tpl、extensions.conf.tpl、dongle.conf.tpl）
4. 实现配置渲染和文件写入功能

### 阶段三：AMI 集成
1. 实现 AMI 客户端（连接、鉴权、事件订阅）
2. 实现 AMI 命令执行（reload、restart、dongle 命令）
3. 实现状态监控和上报

### 阶段四：核心功能开发
1. **Extension 管理**：API + 前端 CRUD
2. **Dongle 管理**：绑定配置、发送短信（通过 AMI）
3. **通知系统**：实现四种通知适配器，支持多选并行发送
4. **短信处理**：监听 AMI 短信事件，转发到通知渠道

### 阶段五：Web 界面开发
1. **认证系统**：OIDC 登录流程（环境变量强制）
2. **仪表盘**：状态展示、重启按钮、导航栏状态灯
3. **Extension 管理页面**：CRUD 界面
4. **Dongle 管理页面**：绑定配置、发送短信界面
5. **通知配置页面**：多选通知渠道配置
6. **日志页面**：实时流 + 最近 N 行展示

### 阶段六：Docker 化和部署
1. 编写 Dockerfile
2. 配置 Supervisor
3. 编写启动脚本
4. 配置端口暴露和 USB 设备挂载
5. 编写部署文档

### 阶段七：文档和测试
1. 编写使用说明文档
2. 编写部署文档
3. 更新 README.md
4. 端到端测试：
   - 通知多通道测试
   - 来电路由测试
   - Extension 注册测试
   - 配置持久化/reload 测试
   - OIDC 登录测试
   - Asterisk 重启测试
   - 状态指示测试
   - 日志页面测试
   - Dongle 发送短信测试

## 技术细节

### Asterisk 配置模板
- **sip.conf.tpl**：SIP 通道配置，使用 TCP transport，端口从数据库读取
- **extensions.conf.tpl**：拨号计划，包含 dongle 来去电路由到 extension 的规则
- **dongle.conf.tpl**：USB dongle 设备配置

### AMI 命令示例
- `core reload`：重新加载配置
- `core restart now`：立即重启
- `dongle send sms <device> <number> <message>`：发送短信（具体命令格式需确认）

### 环境变量要求
- **OIDC 配置**（必须）：
  - `LAZYCAT_AUTH_OIDC_CLIENT_ID`
  - `LAZYCAT_AUTH_OIDC_CLIENT_SECRET`
  - `LAZYCAT_AUTH_OIDC_AUTH_URI`
  - `LAZYCAT_AUTH_OIDC_TOKEN_URI`
  - `LAZYCAT_AUTH_OIDC_USERINFO_URI`
- **AMI 配置**（必须）：
  - `ASTERISK_AMI_USERNAME`
  - `ASTERISK_AMI_PASSWORD`
- **Web 端口**（可选，默认 8071）：
  - `WEB_PORT`

### 日志文件路径
- 默认：`/var/log/asterisk/full`
- 可通过 `logger.conf` 配置

## 待确认事项

- [x] SIP 仅使用 TCP
- [x] RTP 默认端口段：40890-40900
- [x] Web 管理端口默认：8071
- [x] AMI 账户/密码来自环境变量
- [x] OIDC 回调路径：`/auth/oidc/callback`
- [x] 前端构建产物放在容器目录，通过 Gin 静态服务
- [x] 日志展示：实时流 + 最近 N 行
- [x] 配置方式：文件模板 + reload
- [x] 发送短信：通过 AMI，不直接与 dongle 通信

## 更新日志

- 2025-12-12：初始计划制定完成

