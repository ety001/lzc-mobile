# Alpine Linux Asterisk 测试结果

## 测试环境
- **基础镜像**：Alpine 3.23.2
- **Asterisk 版本**：20.15.2-r1
- **安装包**：`asterisk`, `asterisk-doc`, `asterisk-sample-config`

## 关键发现

### ✅ 没有 Stasis 初始化失败错误！

测试结果显示：
- **没有** `Stasis initialization failed` 错误
- **没有** `Cannot update type 'declined_message_types'` 错误
- Asterisk 可以正常启动（虽然有其他模块初始化失败，但 Stasis 正常）

### 配置文件
- 配置文件位置：`/etc/asterisk/`
- 配置文件已存在（通过 `asterisk-sample-config` 包安装）
- 文档目录：`/usr/share/asterisk/documentation/`（存在但可能为空）

### 其他发现
- ALSA 警告（正常，因为没有音频设备）
- 某些模块初始化失败（可能是配置问题，不是 Stasis 问题）

## 结论

**Alpine Linux 的 Asterisk 包没有 Stasis 初始化问题！**

这可能是因为：
1. Alpine 的包维护者已经修复了这个问题
2. 或者使用了不同的编译配置
3. 或者文档文件以不同方式提供

## 建议

考虑使用 Alpine Linux + Asterisk 官方包：
- ✅ 没有 Stasis 初始化问题
- ✅ Asterisk 20.15.2（版本较新）
- ✅ 体积小
- ⚠️ 需要确认 Go 应用和 Quectel 模块的兼容性
