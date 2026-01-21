# 数据库架构文档

## 概述

LZC Mobile 使用 SQLite 数据库存储所有配置数据，通过 GORM ORM 进行数据库操作。程序启动时会自动执行数据库迁移（AutoMigrate），创建所需的表结构。

## 数据库表关系图

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Extension  │         │ DongleBinding│         │   Dongle    │
├─────────────┤         ├──────────────┤         ├─────────────┤
│ ID (PK)     │<───────│ ExtensionID  │         │ ID (PK)     │
│ Username    │         │ DongleID ────┼────────►│ DeviceID (U)│⭐
│ Secret      │         │ Inbound      │         │ Device      │
│ CallerID    │         │ Outbound     │         │ Audio       │
│ Host        │         └──────────────┘         │ Data        │
│ Context     │                                  │ DialPrefix  │
└─────────────┘                                  │ Disable     │
                                                 │ Group       │
                                                 │ Context     │
                                                 └─────────────┘
                                                        │
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │  SMSMessage  │
                                                 ├──────────────┤
                                                 │ DongleID ────┘
                                                 │ PhoneNumber  │
                                                 │ Content      │
                                                 │ Direction    │
                                                 │ SMSIndex     │
                                                 └──────────────┘
```

**图例说明：**
- `PK` = Primary Key（主键）
- `U` = Unique Index（唯一索引）
- `───>` = 外键关联
- ⭐ = 重要关联字段

## 数据库表详解

### 1. extensions 表（SIP 分机）

**用途：** 存储 SIP Extension（分机）配置

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键（自增） |
| username | VARCHAR(100) | NOT NULL, UNIQUE | SIP 用户名（如 100, 101） |
| secret | VARCHAR(255) | NOT NULL | SIP 密码 |
| callerid | VARCHAR(255) | | 主叫号码显示名称 |
| host | VARCHAR(255) | DEFAULT 'dynamic' | 主机地址（PJSIP 自动检测） |
| context | VARCHAR(100) | DEFAULT 'default' | 上下文（dialplan 上下文） |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

**索引：**
- `username`：唯一索引（防止重复的分机号）

**PJSIP 配置：**
- PJSIP 自动适配 TCP/UDP 传输协议
- `host=dynamic` 表示客户端 IP 自动检测

---

### 2. dongles 表（USB Dongle 设备）

**用途：** 存储物理 USB Dongle（GSM Modem）设备配置

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键（自增） |
| device_id | VARCHAR(100) | NOT NULL, UNIQUE | 设备标识（quectel0, quectel1）⭐ |
| device | VARCHAR(255) | | 设备路径（/dev/ttyUSB0） |
| audio | VARCHAR(255) | | 音频设备路径（/dev/ttyUSB1） |
| data | VARCHAR(255) | | 数据设备路径（/dev/ttyUSB2） |
| group | INTEGER | DEFAULT 0 | 组号（用于负载均衡） |
| context | VARCHAR(100) | DEFAULT 'quectel-incoming' | 来电上下文 |
| dial_prefix | VARCHAR(10) | DEFAULT '999' | 外呼前缀 |
| disable | BOOLEAN | DEFAULT false | 是否禁用设备 |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

**索引：**
- `device_id`：唯一索引（防止重复的设备 ID）

**重要字段说明：**
- `device_id`：Asterisk 配置中的设备标识（如 quectel0）
- `dial_prefix`：外呼前缀，例如拨打 99910010 → 实际拨打 10010
- `disable`：禁用后该设备不会处理来电和去电

---

### 3. dongle_bindings 表（Dongle 绑定关系）

**用途：** 存储 Dongle 与 Extension 的来去电绑定关系

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键（自增） |
| dongle_id | VARCHAR(100) | NOT NULL, INDEX | Dongle 设备 ID（⭐ 关联到 dongles.device_id） |
| extension_id | INTEGER | NOT NULL, INDEX | Extension 主键 ID |
| inbound | BOOLEAN | DEFAULT true | 是否处理来电 |
| outbound | BOOLEAN | DEFAULT true | 是否处理去电 |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

**索引：**
- `dongle_id`：普通索引（用于快速查找某个 Dongle 的所有绑定）
- `extension_id`：普通索引（用于快速查找某个 Extension 的所有绑定）

**重要关系说明：**
- ⭐ `dongle_id` 字段存储的是 `device_id`（字符串，如 "quectel0"）
- ⭐ 不是 Dongle 表的主键 ID（数字）
- 一个 Dongle 可以绑定多个 Extension
- 一个 Extension 也可以绑定到多个 Dongle

**外键关联：**
- `dongle_id` → `dongles.device_id`（字符串关联）
- `extension_id` → `extensions.id`（主键关联）

---

### 4. sms_messages 表（短信记录）

**用途：** 存储所有短信（接收和发送）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键（自增） |
| dongle_id | VARCHAR(100) | NOT NULL, INDEX | Dongle 设备 ID（⭐ 关联到 dongles.device_id） |
| phone_number | VARCHAR(50) | NOT NULL, INDEX | 对方电话号码 |
| content | TEXT | NOT NULL | 短信内容 |
| direction | VARCHAR(10) | DEFAULT 'inbound', INDEX | 方向：inbound（接收）/ outbound（发送） |
| sms_index | INTEGER | INDEX | SIM 卡短信索引 |
| sms_timestamp | DATETIME | | SIM 卡短信时间戳 |
| pushed | BOOLEAN | DEFAULT false, INDEX | 是否已推送到通知渠道 |
| pushed_at | DATETIME | | 推送时间 |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

**索引：**
- `dongle_id`：用于按设备查询短信
- `phone_number`：用于按号码查询短信
- `direction`：用于按方向查询短信
- `pushed`：用于查询未推送的短信

**重要关系说明：**
- ⭐ `dongle_id` 字段存储的是 `device_id`（字符串，如 "quectel0"）
- 不是 Dongle 表的主键 ID（数字）

---

### 5. sip_configs 表（SIP 配置）

**用途：** 存储全局 SIP 配置（端口、绑定地址）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键（固定为 1） |
| port | INTEGER | NOT NULL, DEFAULT 5060 | SIP 监听端口 |
| host | VARCHAR(255) | DEFAULT '0.0.0.0' | SIP 绑定地址 |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

---

### 6. rtp_configs 表（RTP 配置）

**用途：** 存储全局 RTP 配置（端口范围）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键（固定为 1） |
| start_port | INTEGER | NOT NULL, DEFAULT 40890 | RTP 起始端口 |
| end_port | INTEGER | NOT NULL, DEFAULT 40900 | RTP 结束端口 |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

---

### 7. notification_configs 表（通知渠道配置）

**用途：** 存储各种通知渠道的配置（SMTP, Slack, Telegram, Webhook）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键 |
| channel | VARCHAR(50) | NOT NULL, UNIQUE | 渠道类型：smtp/slack/telegram/webhook |
| enabled | BOOLEAN | DEFAULT false | 是否启用 |
| use_proxy | BOOLEAN | DEFAULT false | 是否使用 HTTP 代理 |
| ... | ... | ... | 各渠道特定配置字段 |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

---

### 8. global_configs 表（全局配置）

**用途：** 存储全局配置（HTTP 代理等）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键（固定为 1） |
| http_proxy | VARCHAR(500) | | HTTP 代理服务器地址 |
| created_at | DATETIME | | 创建时间 |
| updated_at | DATETIME | | 更新时间 |

---

### 9. admin_users 表（管理员用户）

**用途：** 存储 OIDC 认证的管理员用户

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 主键 |
| email | VARCHAR(255) | NOT NULL, UNIQUE | 邮箱 |
| name | VARCHAR(255) | | 用户名 |
| subject | VARCHAR(255) | NOT NULL, UNIQUE | OIDC Subject（唯一标识） |
| created_at | DATETIME | | 创建时间 |

---

## 关键设计决策

### 1. Dongle 关联使用 device_id 而非主键 ID

**为什么？**
- 业务语义清晰：`device_id`（quectel0）比数字 ID 更有意义
- 配置文件友好：Asterisk 配置中使用 `quectel0` 这样的标识
- 避免查询开销：不需要每次都 join Dongle 表获取 device_id

**影响：**
- 删除 Dongle 时，需要用 `device_id` 查找相关绑定 ✅（已实现）
- GORM 外键关联需要特殊配置：`foreignKey:DongleID;references:DeviceID` ✅（已配置）

### 2. Dongle 可以绑定多个 Extension

**设计：**
- 移除了 `dongle_id` 的唯一索引约束
- 一个 Dongle 可以同时绑定多个 Extension
- 支持灵活的来去电路由配置

**应用场景：**
- 多个用户共享同一个 Dongle 接收来电
- 不同 Extension 可以使用不同的 Dongle 拨打电话

### 3. 外呼前缀机制

**工作原理：**
1. 用户拨打：`99910010`（外呼前缀 + 实际号码）
2. Asterisk dialplan 匹配：`_999X.` 模式
3. 去除前缀：`${EXTEN:3}` → `10010`
4. 通过对应 Dongle 拨打：`Dial(Quectel/quectel0/10010)`

**配置位置：**
- 数据库：`dongles.dial_prefix`（默认 999）
- 模板：`configs/asterisk/extensions.conf.tpl`

---

## 数据库迁移

### AutoMigrate 机制

程序启动时会自动执行以下迁移：
```go
db.AutoMigrate(
    &SIPConfig{},
    &RTPConfig{},
    &NotificationConfig{},
    &Extension{},
    &Dongle{},              // ⭐ 新增
    &DongleBinding{},
    &SMSMessage{},
    &GlobalConfig{},
    &AdminUser{},
)
```

**行为：**
- 如果表不存在：自动创建表
- 如果表已存在：
  - 添加缺失的列
  - 添加缺失的索引
  - **不会删除列**（即使模型中已移除）
  - **不会删除已有数据**

### 手动迁移文件

对于无法通过 AutoMigrate 完成的迁移，需要手动执行 SQL 文件：

**已提供的迁移文件：**
- `storage/migrations/20250122_remove_port_from_extensions.sql`：移除 extensions.port 字段
- `storage/migrations/20250122_remove_transport_from_extensions.sql`：移除 extensions.transport 字段

**执行方法：**
```bash
# 在容器内执行
sqlite3 /var/lib/lzc-mobile/data.db < /path/to/migration.sql
```

---

## 数据完整性约束

### 删除约束

1. **删除 Extension**
   - 检查是否有 Dongle 绑定
   - 如果有绑定，拒绝删除

2. **删除 Dongle**
   - 检查是否有 Dongle 绑定
   - 如果有绑定，拒绝删除 ⭐（已修复）

3. **删除 Dongle 绑定**
   - 无约束，可以直接删除

### 唯一性约束

- `extensions.username`：唯一（分机号不能重复）
- `dongles.device_id`：唯一（设备 ID 不能重复）
- `notification_configs.channel`：唯一（每种渠道只能有一个配置）
- `admin_users.email`：唯一
- `admin_users.subject`：唯一

---

## 性能优化建议

### 索引策略

已创建的索引：
- `extensions.username`（唯一索引）
- `dongles.device_id`（唯一索引）
- `dongle_bindings.dongle_id`（普通索引）
- `dongle_bindings.extension_id`（普通索引）
- `sms_messages.dongle_id`（普通索引）
- `sms_messages.phone_number`（普通索引）
- `sms_messages.direction`（普通索引）
- `sms_messages.pushed`（普通索引）

### 查询优化

1. **Preload 关联数据**
   ```go
   // 预加载 Extension 关联
   database.DB.Preload("Extension").Find(&bindings)
   ```

2. **使用索引字段查询**
   ```go
   // 使用 device_id（索引）查询
   database.DB.Where("dongle_id = ?", "quectel0").Find(&bindings)
   ```

---

## 数据库备份

### 备份命令

```bash
# 在容器内备份数据库
sqlite3 /var/lib/lzc-mobile/data.db ".backup /tmp/data.db.backup"

# 或使用 SQL 导出
sqlite3 /var/lib/lzc-mobile/data.db .dump > backup.sql
```

### 恢复命令

```bash
# 从 SQL 文件恢复
sqlite3 /var/lib/lzc-mobile/data.db < backup.sql
```

---

## 故障排查

### 常见问题

1. **外键约束失败**
   - 检查 `dongle_id` 是否使用正确的 `device_id` 值
   - 确认 Dongle 记录存在

2. **删除操作失败**
   - 检查是否有依赖的绑定关系
   - 先删除绑定，再删除主记录

3. **AutoMigrate 不生效**
   - GORM 不会删除列，需要手动迁移
   - 检查字段类型是否匹配

---

## 版本历史

### v0.0.1 (2025-01-22)
- 初始数据库结构
- 添加 Dongle 表
- 优化 DongleBinding 关联（使用 device_id）
- 移除 Extension.transport 字段
- 移除 Extension.port 字段

---

## 相关文档

- [项目架构规划](../docs/plan.md)
- [部署文档](../docs/deployment.md)
- [使用说明](../docs/usage.md)
- [README](../README.md)
