# Alpine Linux Asterisk 包信息

## Alpine 3.23.2

**官方仓库**：✅ **有 Asterisk 包**

### 包信息
- **包名**：`asterisk`
- **版本**：`20.15.2-r1`
- **描述**：Modular Open Source PBX System
- **安装大小**：14 MiB

### 相关包
- `asterisk-doc-20.15.2-r1` - 文档包（包含 XML 文档）
- `asterisk-dev-20.15.2-r1` - 开发包（头文件）
- `asterisk-sample-config-20.15.2-r1` - 示例配置
- `asterisk-alsa-20.15.2-r1` - ALSA 支持
- `asterisk-curl-20.15.2-r1` - cURL 支持
- `asterisk-ldap-20.15.2-r1` - LDAP 支持
- `asterisk-mobile-20.15.2-r1` - 移动设备支持
- `asterisk-opus-20.15.2-r1` - Opus 编解码器
- `asterisk-pgsql-20.15.2-r1` - PostgreSQL 支持
- `asterisk-chan-dongle-1.1.20211005-r3` - 3G/4G dongle 支持

### 优点
1. ✅ **官方包**：Alpine 官方仓库维护
2. ✅ **版本较新**：Asterisk 20.15.2（接近我们尝试编译的 20.17.0）
3. ✅ **包含文档**：`asterisk-doc` 包应该包含 XML 文档
4. ✅ **体积小**：Alpine 基础镜像很小
5. ✅ **完整配置**：包含示例配置文件

### 缺点
1. ⚠️ **musl libc**：Alpine 使用 musl 而不是 glibc，可能与某些 Go 程序不兼容
2. ⚠️ **Quectel 模块**：需要确认是否能编译（可能需要调整）
3. ⚠️ **Go 应用**：需要确认 Go 应用在 Alpine 上是否正常运行

## 安装命令

```bash
apk add --no-cache asterisk asterisk-doc
```

## 测试结果

需要测试：
1. Asterisk 是否能正常启动（不出现 Stasis 错误）
2. XML 文档是否存在
3. Quectel 模块是否能编译
4. Go 应用是否能正常运行
