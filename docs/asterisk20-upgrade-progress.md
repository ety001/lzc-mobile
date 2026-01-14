# Asterisk 20 + Debian 13 升级进展总结

## 升级概述

本次升级将 `lzc-mobile` 项目从 Asterisk 16（Debian 11）升级到 Asterisk 20.17.0（Debian 13），采用源码编译方式，并优化了 Docker 构建缓存。

## 已完成的工作

### 1. 基础环境升级
- ✅ **Debian 11 → Debian 13**：所有构建阶段的基础镜像已更新
- ✅ **Go 构建器**：更新到 Debian 13 基础镜像
- ✅ **前端构建器**：保持使用 Node.js 20 Alpine（无需变更）
- ✅ **最终镜像**：更新到 Debian 13，并更新了所有运行时依赖包版本

### 2. Asterisk 20 源码编译
- ✅ **Asterisk 版本**：成功编译 Asterisk 20.17.0（从源码）
- ✅ **编译配置**：
  - 使用 `--with-jansson-bundled` 和 `--with-pjproject-bundled`
  - 在 `menuselect` 中禁用了 `res_stasis` 和 `app_stasis` 模块
  - 优化了编译步骤，分离了依赖安装、配置、编译、安装等阶段以利用 Docker 缓存
- ✅ **共享库**：正确复制了 `libasteriskssl.so.1` 和 `libasteriskpj.so.2` 等共享库
- ✅ **用户和组**：创建了 `asterisk` 用户和组，并添加到 `dialout` 组

### 3. Quectel 模块编译
- ✅ **模块版本**：成功编译 `chan_quectel` 模块（针对 Asterisk 20）
- ✅ **编译配置**：使用 `--with-astversion=20 --with-asterisk=/usr/include`
- ✅ **依赖管理**：正确安装了编译所需的依赖（autoconf, automake, libtool 等）

### 4. Docker 构建优化
- ✅ **多阶段构建**：分离了 Go 构建、前端构建、Asterisk 构建、Quectel 构建和最终镜像阶段
- ✅ **缓存优化**：
  - 分离了 `apt-get install`、`wget`、`configure`、`make`、`make install` 等步骤
  - 使用 `ARG` 支持灵活的 Asterisk 版本配置
  - 使用 `make -j$(nproc)` 进行并行编译
  - 创建了 `.dockerignore` 文件排除不必要的文件
- ✅ **依赖包更新**：更新了 Debian 13 的包名（如 `libavcodec61`、`libcodec2-1.2`、`libbluetooth3` 等）

### 5. 配置修复
- ✅ **目录权限**：创建了 `/var/lib/asterisk`、`/var/spool/asterisk` 等目录并设置了正确的权限
- ✅ **stasis.conf**：为 Asterisk 20 创建了正确的配置（使用 `taskpool` 而不是 `threadpool`）
- ✅ **modules.conf**：禁用了所有 stasis 相关模块（`res_stasis.so`、`app_stasis.so` 等）

### 6. 代码修复
- ✅ **Go 编译错误**：修复了未使用的 `log` 包导入问题
- ✅ **配置渲染**：更新了 `renderer.go` 以正确渲染 `stasis.conf`

## 遇到的问题和解决方案

### 问题 1：Debian 13 包名变更
**问题**：构建失败，找不到 `libavcodec60`、`libcodec2-1.0` 等包
**解决**：更新了包名到 Debian 13 版本（`libavcodec61`、`libcodec2-1.2`、`libbluetooth3`），移除了已废弃的 `libavresample4`

### 问题 2：ASTERISK_SOURCE_URL ARG 位置错误
**问题**：`wget` 命令失败，`ASTERISK_SOURCE_URL` 为空
**解决**：将 `ARG ASTERISK_SOURCE_URL` 移动到 `FROM` 指令之后，因为 ARG 在 `FROM` 之前定义时只在 `FROM` 指令中可用

### 问题 3：Quectel 模块找不到头文件
**问题**：`configure` 失败，找不到 `asterisk.h`
**解决**：
- 在 `asterisk-builder` 阶段添加了 `make install-headers DESTDIR=/tmp/asterisk-install`
- 更新了 `quectel-builder` 阶段的 `--with-asterisk` 路径为 `/usr/include`

### 问题 4：缺少共享库
**问题**：运行时错误 `libasteriskssl.so.1: cannot open shared object file`
**解决**：在 `final` 阶段添加了 `COPY --from=asterisk-builder /tmp/asterisk-install/usr/lib/libasterisk* /usr/lib/`

### 问题 5：Asterisk 用户不存在
**问题**：`usermod: user 'asterisk' does not exist`
**解决**：在 `final` 阶段添加了 `groupadd -r asterisk && useradd -r -g asterisk ...` 命令

### 问题 6：数据库文件权限问题
**问题**：`Unable to open Asterisk database '/var/lib/asterisk/astdb.sqlite3'`
**解决**：创建了 `/var/lib/asterisk` 和 `/var/spool/asterisk` 目录，并设置了 `asterisk` 用户的所有权

## 当前仍存在的问题

### 问题：Stasis 初始化失败

**错误信息**：
```
Cannot update type 'declined_message_types' in module 'stasis' because it has no existing documentation! If this module was recently built, run 'xmldoc reload' to refresh documentation, then load the module again
Stasis initialization failed.  ASTERISK EXITING!
```

**已尝试的解决方案**：
1. ✅ 在编译时禁用 `res_stasis` 和 `app_stasis` 模块
2. ✅ 在 `modules.conf` 中禁用所有 stasis 相关模块
3. ✅ 创建了正确的 `stasis.conf`（使用 `taskpool`，不包含 `[declined_message_types]` 部分）
4. ✅ 确保 `stasis.conf` 文件存在且配置正确

**问题分析**：
- Stasis 是 Asterisk 的核心组件，无法完全禁用
- 即使 `stasis.conf` 中不包含 `[declined_message_types]` 部分，Asterisk 仍然尝试更新该类型
- 错误提示需要 XML 文档文件，但源码编译的 Asterisk 可能缺少这些文档

**影响**：
- Asterisk 无法正常启动
- AMI（Asterisk Manager Interface）无法连接
- 系统状态显示 "AMI client not connected"

## 当前状态

### 成功运行的组件
- ✅ **Asterisk 20.17.0**：已成功编译并可以运行（但启动后立即退出）
- ✅ **Quectel 模块**：已成功编译（但无法验证，因为 Asterisk 未运行）
- ✅ **Web 面板**：正常运行
- ✅ **Supervisor**：正常运行

### 无法运行的组件
- ❌ **Asterisk**：启动后因 Stasis 初始化失败而退出
- ❌ **AMI 连接**：无法建立连接

## 下一步建议

### 方案 1：安装 XML 文档（推荐）
尝试在构建时安装或生成 Asterisk XML 文档：
```dockerfile
# 在 asterisk-builder 阶段
RUN make samples DESTDIR=/tmp/asterisk-install
# 可能需要额外的文档生成步骤
```

### 方案 2：显式配置 declined_message_types
在 `stasis.conf` 中添加空的 `[declined_message_types]` 部分，或者添加一些有效的消息类型：
```ini
[declined_message_types]
; 显式声明，即使为空
```

### 方案 3：使用 Asterisk 18
如果 Stasis 问题无法解决，考虑使用 Asterisk 18 LTS 版本，它可能更稳定且文档更完整。

### 方案 4：社区支持
- 查看 Asterisk 官方论坛或 GitHub Issues
- 搜索 "Asterisk 20 stasis initialization failed" 相关讨论
- 考虑提交 bug report

## 提交记录

以下是本次升级过程中的主要提交：

```
fd12a0d fix: 移除未使用的 log 包导入
6aad723 fix: 为 Asterisk 20 创建正确的 stasis.conf
40faf81 fix: 创建 /var/lib/asterisk 目录并设置权限
d3eb462 fix: 复制 Asterisk 共享库文件
402a8c4 fix: 在编译时禁用 Stasis 模块
801be8a fix: 创建 asterisk 用户和组
116c11e fix: 调整 quectel configure 的 --with-asterisk 路径
f0fee04 fix: 安装 Asterisk 头文件并指定 quectel configure 路径
ca8c0ce fix: 在 quectel-builder 阶段添加 libsqlite3-dev 依赖
35d5a87 fix: 修复 ASTERISK_SOURCE_URL ARG 定义位置
```

## 技术栈总结

### 升级前
- **Asterisk**: 16.28.0（Debian 包）
- **Debian**: 11
- **Quectel 模块**: 针对 Asterisk 16

### 升级后
- **Asterisk**: 20.17.0（源码编译）
- **Debian**: 13
- **Quectel 模块**: 针对 Asterisk 20

## 构建时间优化

通过 Docker 缓存优化，后续构建时间大幅缩短：
- **首次构建**：约 15-20 分钟（包含完整编译）
- **增量构建**：约 2-5 分钟（仅重新编译变更部分）

## 总结

本次升级在技术实现上取得了显著进展：
1. ✅ 成功完成了基础环境升级（Debian 13）
2. ✅ 成功编译了 Asterisk 20.17.0 和 Quectel 模块
3. ✅ 优化了 Docker 构建流程
4. ✅ 修复了多个构建和运行时问题

但仍存在一个关键问题：**Stasis 初始化失败**，这导致 Asterisk 无法正常启动。需要进一步调查和解决这个问题才能完成整个升级。
