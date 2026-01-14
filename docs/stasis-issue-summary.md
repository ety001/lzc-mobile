# Asterisk 20 Stasis 初始化问题总结

## 问题确认

通过测试发现，**即使删除所有配置文件并使用默认配置，Stasis 初始化失败的问题仍然存在**。这证明问题不在我们的配置，而是 Asterisk 20.17.0 源码编译版本缺少 XML 文档文件。

## 测试结果

### 测试 1：使用默认配置
- 删除所有 `/etc/asterisk/*.conf` 文件
- 使用 Asterisk 内置默认配置
- **结果**：仍然报错 `Cannot update type 'declined_message_types' in module 'stasis' because it has no existing documentation!`

### 测试 2：删除 stasis.conf
- 备份并删除 `stasis.conf`
- **结果**：仍然报错

### 测试 3：检查文档文件
- 检查 `/var/lib/asterisk/documentation/` 目录
- **结果**：目录不存在
- 检查构建阶段是否有文档文件
- **结果**：`make install DESTDIR=/tmp/asterisk-install` 没有安装文档文件

## 根本原因

1. **缺少 XML 文档**：Asterisk 20 需要 XML 文档文件来初始化 Stasis 模块
2. **源码编译问题**：使用 `make install DESTDIR=...` 时，文档文件可能没有被正确安装
3. **Stasis 核心依赖**：Stasis 是 Asterisk 的核心组件，无法禁用，必须正确初始化

## 错误信息

```
Cannot update type 'declined_message_types' in module 'stasis' because it has no existing documentation! 
If this module was recently built, run 'xmldoc reload' to refresh documentation, then load the module again
Stasis initialization failed.  ASTERISK EXITING!
```

## 已尝试的解决方案

1. ✅ 在编译时禁用 `res_stasis` 和 `app_stasis` 模块
2. ✅ 在 `modules.conf` 中禁用所有 stasis 相关模块
3. ✅ 创建正确的 `stasis.conf`（使用 `taskpool`，不包含 `[declined_message_types]`）
4. ✅ 尝试复制文档目录（但文档文件不存在）

## 可能的解决方案

### 方案 1：在构建时生成 XML 文档
在 `asterisk-builder` 阶段，可能需要：
- 确保 `libxml2-dev` 已安装（✅ 已安装）
- 运行 `make install` 后，手动生成或复制文档文件
- 检查文档文件的实际安装位置

### 方案 2：运行时生成文档
在容器启动时：
- 首次启动 Asterisk（即使失败）
- 运行 `xmldoc reload` 命令
- 但这需要 Asterisk 能够启动，形成循环依赖

### 方案 3：使用预编译的 Asterisk
- 使用 Debian 包管理器安装 Asterisk 20（如果可用）
- 或使用官方 Docker 镜像

### 方案 4：降级到 Asterisk 18 LTS
- Asterisk 18 可能更稳定，文档更完整
- 或者使用 Asterisk 19

### 方案 5：修改源码编译方式
- 检查 `make install` 的完整输出
- 可能需要额外的 `make install-docs` 或类似命令
- 检查 Asterisk 源码中的 Makefile

## 下一步行动

1. 检查 Asterisk 源码中的 Makefile，查找文档安装目标
2. 尝试在构建阶段手动生成 XML 文档
3. 考虑使用 Asterisk 18 或 19 版本
4. 查看 Asterisk 官方文档和社区讨论

## 参考

- [Asterisk 20 Documentation](https://docs.asterisk.org/Asterisk_20_Documentation/)
- [Asterisk Stasis Message Bus](https://docs.asterisk.org/Fundamentals/Key-Concepts/The-Stasis-Message-Bus/)
- [Asterisk XML Documentation](https://docs.asterisk.org/Development/XML-Documentation/)
