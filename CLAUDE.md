# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

懒猫通信 (LZC Mobile) 是一个基于 Golang 的简易 FreePBX 系统，提供 Web 管理界面来管理 USB dongle（GSM Modem）、SIP 客户端和短信通知。

**核心功能：**
- USB Dongle 管理（GSM Modem），支持收发短信和接打电话
- SIP 客户端支持（PJSIP），管理 SIP extension
- 多通道通知系统（邮件/Slack/Telegram/Webhook）
- Web 管理面板（React + Tailwind CSS）
- Asterisk 配置自动生成和管理

**技术栈：**
- 后端：Go 1.25 + Gin
- 前端：React 19 + Vite + Tailwind CSS 4.1
- 数据库：SQLite + GORM
- PBX：Asterisk 20 + chan_quectel 模块
- 进程管理：Supervisor
- 容器化：Docker（多阶段构建）

## 开发命令

### 前端开发

```bash
cd internal/frontend
pnpm install        # 安装依赖
pnpm dev            # 启动开发服务器（http://localhost:5173）
pnpm build          # 生产构建
pnpm lint           # ESLint 检查
```

### 后端开发

```bash
# 编译 Go 程序
go build -o bin/webpanel ./cmd/webpanel

# 运行（需要先配置环境变量）
export ASTERISK_AMI_USERNAME=admin
export ASTERISK_AMI_PASSWORD=secret
export LAZYCAT_AUTH_OIDC_CLIENT_ID=...
export LAZYCAT_AUTH_OIDC_CLIENT_SECRET=...
./bin/webpanel
```

### Docker 构建

```bash
# 本地构建（不推送）
docker build -t lzc-mobile -f docker/Dockerfile .

# 构建并推送到远程仓库
TAG=$(date +%s)
docker build --push -t dev.ecat.heiyu.space/ety001/lzc-mobile:$TAG -f docker/Dockerfile .
```

### 远程部署

```bash
# 1. 更新 lzc-appdb 配置
cd ~/workspace/lzc-appdb/lzc-mobile
# 更新 lzc-manifest.yml 中的 image tag

# 2. 构建并部署
lzc-cli project build && lzc-cli app install

# 3. 查看服务状态
lzc-docker ps | grep lzcmobile

# 4. 查看容器日志
lzc-docker logs -f inkakawaety001lzcmobile-lzcmobile-1
```

### 调试 Asterisk

```bash
# 登录远程服务器（仅查看，不能修改）
ssh root@ecat.heiyu.space

# 查看 Asterisk 日志
lzc-docker logs inkakawaety001lzcmobile-lzcmobile-1 2>&1 | grep -i error

# 查看实际生成的配置文件
lzc-docker exec inkakawaety001lzcmobile-lzcmobile-1 cat /etc/asterisk/extensions.conf

# 重启 Asterisk（通过 Web 面板的 "重启 Asterisk" 按钮）
# 或手动执行：
lzc-docker exec inkakawaety001lzcmobile-lzcmobile-1 supervisorctl restart asterisk
```

## 架构设计

### 核心架构原则

1. **配置持久化机制**
   - AMI（Asterisk Manager Interface）仅用于运行时监控和控制，不持久化配置
   - 用户配置写入 SQLite 数据库
   - Go 程序通过模板引擎渲染 Asterisk 配置文件（位于 `configs/asterisk/*.tpl`）
   - 配置变更后通过 AMI 发送 `core reload` 命令使配置生效
   - 配置持久保存在文件中，Asterisk 重启后自动加载

2. **模块化设计**
   - `internal/ami`: AMI 客户端，连接和监听 Asterisk 事件
   - `internal/config`: 配置模板渲染器
   - `internal/database`: SQLite 数据库模型和初始化
   - `internal/web`: Gin Web 服务器和 API 路由
   - `internal/auth`: OIDC 认证
   - `internal/sms`: 短信处理和通知
   - `internal/notify`: 多通道通知系统
   - `internal/frontend`: React 前端应用

3. **Docker 多阶段构建**
   - `frontend-builder`: Node.js 20，构建 React 前端
   - `go-builder`: Golang 1.25，编译后端二进制
   - `quectel-builder`: 编译 chan_quectel 模块
   - `stage-3`: 运行时镜像（Alpine 3.23.2 + Asterisk + Supervisor）

### 关键数据流

```
用户操作（Web UI）
    ↓
Gin API Handler
    ↓
SQLite 数据库（持久化）
    ↓
Config Renderer（模板渲染）
    ↓
Asterisk 配置文件（/etc/asterisk/*）
    ↓
AMI Client（发送 core reload）
    ↓
Asterisk（重新加载配置）
```

### Asterisk 配置模板系统

**模板位置：** `configs/asterisk/*.tpl`

**关键模板文件：**
- `pjsip.conf.tpl`: PJSIP 配置（Extensions 和 transports）
- `extensions.conf.tpl`: 拨号计划（来电路由、去电路由）
- `quectel.conf.tpl`: Quectel 设备配置
- `manager.conf.tpl`: AMI 配置
- `modules.conf.tpl`: Asterisk 模块加载
- `stasis.conf.tpl`: Stasis 应用配置

**渲染器：** `internal/config/renderer.go`
- `LoadConfigData()`: 从数据库加载配置数据
- `RenderTemplate()`: 渲染单个模板文件
- `RenderAll()`: 渲染所有配置文件

**重要：** 修改 Asterisk 配置模板时，必须避免重复的扩展定义。使用 `GotoIf` 和优先级标签（priority labels）来处理条件路由。

### AMI 集成

**AMI 客户端：** `internal/ami/`
- `client.go`: AMI 连接和基本操作
- `manager.go`: AMI 管理器，事件监听和分发
- `errors.go`: AMI 错误处理

**关键功能：**
- 监听 Asterisk 状态变化
- 接收短信事件（UserEvent）
- 发送命令（core reload, dongle 命令等）
- 实时状态推送到前端（WebSocket）

### 数据库模型

**位置：** `internal/database/models.go`

**核心模型：**
- `SIPConfig`: SIP 端口和绑定地址
- `RTPConfig`: RTP 端口范围
- `Extension`: SIP Extension（username, secret, callerid, transport）
- `Dongle`: Dongle 设备（ID, IMEI, IMSI, device path）
- `DongleBinding`: Dongle 与 Extension 的绑定关系（inbound, outbound）
- `NotificationConfig`: 通知渠道配置（SMTP, Slack, Telegram, Webhook）
- `GlobalConfig`: 全局配置（HTTP proxy）

**初始化：** `internal/database/db.go`
- `Init()`: 初始化 SQLite 连接和自动迁移
- `Seed()`: 填充种子数据（默认 SIP/RTP 配置）

### 前端架构

**位置：** `internal/frontend/`

**技术栈：**
- React 19 + Vite 7
- React Router 7（路由）
- Tailwind CSS 4.1（样式）
- Radix UI（组件库）
- Lucide React（图标）
- Axios（HTTP 客户端）
- xterm.js（Web Terminal）

**目录结构：**
- `src/pages/`: 页面组件
- `src/components/`: 可复用组件
- `src/components/ui/`: Radix UI 组件
- `src/components/layout/`: 布局组件
- `src/services/`: API 服务层
- `src/lib/`: 工具函数

**关键页面：**
- `Dashboard.jsx`: 仪表盘（Asterisk 状态统计）
- `Extensions.jsx`: Extension 管理
- `Dongles.jsx`: Dongle 管理和绑定
- `SMS.jsx`: 短信管理
- `Notifications.jsx`: 通知渠道配置
- `Logs.jsx`: 日志查看
- `Terminal.jsx`: Web Terminal（Asterisk CLI）

## 环境变量配置

### 必需的环境变量

```bash
# AMI 认证（Asterisk Manager Interface）
ASTERISK_AMI_USERNAME=admin
ASTERISK_AMI_PASSWORD=your_password

# OIDC 认证（LazyCat Cloud）
LAZYCAT_AUTH_OIDC_CLIENT_ID=your_client_id
LAZYCAT_AUTH_OIDC_CLIENT_SECRET=your_client_secret
LAZYCAT_AUTH_OIDC_AUTH_URI=https://your-domain/sys/oauth/auth
LAZYCAT_AUTH_OIDC_TOKEN_URI=https://your-domain/sys/oauth/token
LAZYCAT_AUTH_OIDC_USERINFO_URI=https://your-domain/sys/oauth/userinfo
```

### 可选的环境变量

```bash
# Web 服务器
WEB_PORT=8071                    # Web 管理端口，默认 8071

# Asterisk 配置路径
ASTERISK_CONFIG_DIR=/etc/asterisk           # Asterisk 配置文件输出目录
ASTERISK_TEMPLATE_DIR=/app/configs/asterisk # 模板文件目录
ASTERISK_LOG_PATH=/var/log/asterisk/full    # Asterisk 日志路径

# LazyCat Cloud（自动注入）
LAZYCAT_APP_DOMAIN                          # LazyCat 应用域名
LAZYCAT_AUTH_OIDC_REDIRECT_URI=/auth/oidc/callback
```

## 重要规则

### 版本控制

1. **禁止自动创建 commit**
   - 不要自动执行 `git add` 或 `git commit`
   - 所有代码变更由用户手动提交
   - 提交前必须经过用户确认

2. **提交信息规范**
   - 使用约定式提交（Conventional Commits）
   - 格式：`<type>: <description>`
   - 类型：feat, fix, refactor, docs, style, test, chore

### Asterisk 配置注意事项

1. **避免扩展重复定义**
   - 在 `extensions.conf.tpl` 中，每个上下文的 `exten => s` 只能定义一次
   - 使用 `GotoIf` 条件判断和优先级标签来处理多路由
   - 示例：
     ```
     exten => s,1,NoOp(Incoming call)
     exten => s,n,GotoIf($["${QUECTELNAME}" = "quectel0"]?binding-quectel0)
     exten => s,n,NoOp(No binding found)
     exten => s,n,Hangup()
     exten => s,n(binding-quectel0),NoOp(Routing to extension 101)
     exten => s,n,Dial(PJSIP/101,30)
     ```

2. **配置文件修改流程**
   - 修改 `configs/asterisk/*.tpl` 模板文件
   - 重新编译 Docker 镜像
   - 部署到远程服务器
   - 通过 Web 面板触发 "重启 Asterisk" 或通过 AMI 发送 `core reload`

3. **调试 Asterisk 问题**
   - 查看完整日志：`lzc-docker logs inkakawaety001lzcmobile-lzcmobile-1`
   - 检查配置文件：`lzc-docker exec ... cat /etc/asterisk/extensions.conf`
   - 查找错误：`lzc-docker logs ... 2>&1 | grep -E "WARNING|ERROR|Unable to register"`
   - 先在服务器上修改验证，然后应用到本地代码

### 前端开发规范

1. **响应式设计**
   - 移动端优先（< 768px）
   - 使用 Tailwind CSS 响应式断点：`sm:`, `md:`, `lg:`
   - 所有交互组件必须支持触摸操作

2. **组件规范**
   - 使用 Radix UI 组件作为基础
   - 遵循现有的设计系统
   - 使用 `lucide-react` 图标库

3. **API 调用**
   - 使用 `src/services/` 中的 API 服务
   - 统一错误处理（使用 Sonner toast）
   - 加载状态显示

### 网络配置

**端口映射：**
- SIP TCP: 5060（可配置）
- RTP UDP: 40890-40900（可配置，10 个端口）
- Web 管理: 8071（可配置）

**USB 设备访问：**
- 使用 `--device=/dev/ttyUSB*` 方式
- 不支持 `--privileged` 模式
- 在容器内需要配置正确的权限

### 部署相关

1. **镜像标签**
   - 不要使用 `latest` 标签
   - 使用 Unix 时间戳作为标签（`$(date +%s)`）
   - 每次部署前必须更新镜像标签

2. **服务名称**
   - 容器名称：`inkakawaety001lzcmobile-lzcmobile-1`
   - 搜索关键词：`lzcmobile`
   - 访问 URL: https://lzcmobile.ecat.heiyu.space/

3. **部署验证**
   - 检查容器状态：`lzc-docker ps | grep lzcmobile`
   - 查看日志：`lzc-docker logs -f inkakawaety001lzcmobile-lzcmobile-1`
   - 验证 Asterisk 启动成功（无 WARNING 或 ERROR）
   - 测试 Web 面板访问和 OIDC 登录

## 故障排查

### Asterisk 无法启动

1. 检查配置文件语法：
   ```bash
   lzc-docker exec inkakawaety001lzcmobile-lzcmobile-1 asterisk -tc
   ```

2. 查看详细错误日志：
   ```bash
   lzc-docker logs inkakawaety001lzcmobile-lzcmobile-1 2>&1 | grep -i "error\|warning"
   ```

3. 检查扩展注册错误：
   ```bash
   lzc-docker logs ... 2>&1 | grep "Unable to register"
   ```

### PJSIP 客户端无法注册

1. 检查网络连接：
   - 确认 SIP 端口（5060）已开放
   - 检查防火墙规则

2. 验证 PJSIP 配置：
   ```bash
   lzc-docker exec ... cat /etc/asterisk/pjsip.conf
   ```

3. 查看 PJSIP 日志：
   ```bash
   lzc-docker logs ... 2>&1 | grep "PJSIP"
   ```

### USB Dongle 无法识别

1. 检查设备权限：
   ```bash
   lzc-docker exec ... ls -la /dev/ttyUSB*
   ```

2. 查看 Quectel 模块日志：
   ```bash
   lzc-docker logs ... 2>&1 | grep "quectel"
   ```

3. 通过 AMI 查看 Dongle 状态：
   - 使用 Web 面板的 Dongle 管理页面
   - 查看连接状态和信号强度

## 开发资源

- **项目架构规划**：`docs/plan.md`
- **部署文档**：`docs/deployment.md`
- **使用说明**：`docs/usage.md`
- **README**：`README.md`

## 特殊注意事项

1. **Chan_quectel vs Chan_dongle**
   - 当前使用 `chan_quectel` 模块
   - 配置文件为 `quectel.conf`（不是 `dongle.conf`）
   - 上下文名称：`[incoming-mobile]` 和 `[quectel-incoming]`

2. **传输协议支持**
   - PJSIP 同时支持 TCP 和 UDP
   - 默认端口：5060（TCP 和 UDP 共用）
   - 配置在 `pjsip.conf.tpl` 中定义

3. **Asterisk 版本**
   - 使用 Asterisk 20（Alpine 官方包）
   - Stasis 配置使用 `taskpool`（不是 `threadpool`）
   - 不包含 `[declined_message_types]` 部分

4. **数据库迁移**
   - 使用 GORM 自动迁移
   - 种子数据在 `internal/database/db.go` 的 `Seed()` 函数中
   - 生产环境数据库路径：`/var/lib/lzc-mobile/data.db`

## 短信发送状态确认

### 查看短信发送状态的方法

#### 1. 通过 Web 界面查看数据库记录
- 访问短信管理页面
- 查看已发送的短信列表
- `direction=outbound` 表示发送的短信
- 状态字段可显示发送结果（需要实现）

#### 2. 查看 Asterisk CLI 实时日志
```bash
# 进入容器
ssh root@ecat.heiyu.space
lzc-docker exec -it inkakawaety001lzcmobile-lzcmobile-1 /usr/sbin/asterisk -rvvvvv
```
发送短信时，你应该看到类似这样的日志：
```
-- Originating Local/sms@quectel-sms
-- Executing [17190013744@quectel-sms:1] NoOp("Sending SMS via quectel: device=quectel0, number=17190013744, message=test")
-- Executing [17190013744@quectel-sms:2] QuectelSendSMS("quectel0","17190013744","test",1440,yes,"")
-- Called quectel0
[quectel0] Sending SMS to 17190013744
[quectel0] SMS sent successfully
```

#### 3. 查看容器日志（筛选发送相关）
```bash
ssh root@ecat.heiyu.space "lzc-docker logs inkakawaety001lzcmobile-lzcmobile-1 2>&1 | grep -E '(QuectelSendSMS|quectel.*sms|originat)' | tail -20"
```

#### 4. 检查设备状态
```bash
ssh root@ecat.heiyu.space "lzc-docker exec inkakawaety001lzcmobile-lzcmobile-1 /usr/sbin/asterisk -rx 'quectel show device state'"
```

#### 5. 查看数据库中的短信记录
```bash
ssh root@ecat.heiyu.space "lzc-docker exec inkakawaety001lzcmobile-lzcmobile-1 sqlite3 /var/lib/lzc-mobile/data.db 'SELECT dongle_id, phone_number, substr(content,1,20) || \"...\", direction, created_at FROM sms_messages ORDER BY created_at DESC LIMIT 10'"
```

#### 6. 检查错误日志
```bash
ssh root@ecat.heiyu.space "lzc-docker logs inkakawaety001lzcmobile-lzcmobile-1 2>&1 | grep -i 'error\|failed\|requestnotallowed' | tail -20"
```

### 短信发送失败的常见原因

1. **AMI 权限不足**
   - 错误：`SecurityEvent="RequestNotAllowed"`
   - 解决：在 `manager.conf.tpl` 中添加 `originate` 权限

2. **Dialplan 缺失**
   - 错误：`sent to invalid extension: context,exten,priority=default,sms,1`
   - 解决：确保 `extensions.conf.tpl` 中有 `[quectel-sms]` context

3. **设备未就绪**
   - 错误：`[quectel0] Unable to open /dev/ttyUSB2`
   - 解决：检查设备权限和连接状态

4. **变量未传递**
   - 错误：`device=, number=, message=`
   - 解决：检查 AMI 变量设置格式（使用 `\n` 分隔多个变量）

### 手机号码隐私保护

在显示和日志中，应该对手机号码进行脱敏处理：

**显示格式：**
- 完整号码：`17190013744`
- 脱敏显示：`171*******44` 或 `1719001****`

**实现位置：**
- 前端显示组件
- 日志输出
- 数据库查询结果
- API 响应

**示例代码：**
```javascript
// 脱敏函数
function maskPhoneNumber(phone) {
  if (!phone || phone.length < 7) return phone;
  return phone.substring(0, 7) + "****";
}
```

5. **日志管理**
   - Asterisk 日志：`/var/log/asterisk/full`
   - 使用 logger.conf 配置日志轮转
   - 应用日志输出到 stdout（由 Supervisor 管理）
