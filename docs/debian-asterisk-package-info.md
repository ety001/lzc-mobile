# Debian Asterisk 包信息

## Debian 12 (Bookworm)

**官方仓库**：❌ **没有 Asterisk 包**

### 替代方案

#### 1. Sangoma FreePBX 仓库（推荐）
- **Asterisk 版本**：Asterisk 22
- **仓库**：`http://deb.freepbx.org/freepbx17-prod bookworm main`
- **包名**：`asterisk22`, `asterisk22-core`, `asterisk22-configs`
- **优点**：官方支持，版本较新
- **缺点**：需要添加第三方仓库

#### 2. Debian 11 包（向后兼容）
- 可以从 Debian 11 仓库安装 Asterisk
- 需要额外安装一些依赖包（`libldap-2.4-2`, `libssl1.1`）

#### 3. AllStarLink 仓库
- 提供完整的 ASL3 系统，包括 Asterisk
- 包含 `app_rpt` 模块

## Debian 11 (Bullseye)

**官方仓库**：✅ **有 Asterisk 包**

### 包信息
- **包名**：`asterisk`
- **版本**：需要检查具体版本号
- **优点**：官方仓库，稳定可靠
- **缺点**：版本可能较旧

## 建议

对于我们的项目，如果使用 Debian 包而不是源码编译：

1. **使用 Debian 11 + Asterisk 官方包**（最稳定）
   - 使用 `debian:11` 作为基础镜像
   - 直接 `apt-get install asterisk`
   - 不需要编译，包含完整的文档和配置

2. **使用 Debian 12 + Sangoma 仓库**（版本较新）
   - 使用 `debian:12` 作为基础镜像
   - 添加 Sangoma FreePBX 仓库
   - 安装 `asterisk22` 包

3. **继续使用源码编译**（当前方案）
   - 需要解决 XML 文档问题
   - 可以完全控制编译选项和模块

## 检查命令

```bash
# Debian 11
docker run --rm debian:11 bash -c "apt-get update -qq >/dev/null 2>&1 && apt-cache policy asterisk"

# Debian 12
docker run --rm debian:12 bash -c "apt-get update -qq >/dev/null 2>&1 && apt-cache policy asterisk"
```
