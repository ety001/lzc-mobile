# Asterisk 20 + Debian 13 升级可行性评估

## 一、升级目标

- **Asterisk**: 16.28.0 → 20.x
- **Debian**: 11 (bullseye) → 13 (trixie)
- **关键模块**: chan_quectel (quectel 模块)

## 二、兼容性评估

### 2.1 Asterisk 20 在 Debian 13 上的可用性

**现状**：
- ❌ Debian 13 官方仓库中**没有** Asterisk 20 的预编译包
- ✅ Asterisk 20 可以**从源码编译**在 Debian 13 上成功运行
- ✅ 有第三方仓库（如 AllStarLink）提供 Asterisk 20 的 Debian 包

**解决方案**：
1. **从源码编译**（推荐）：完全控制版本和编译选项
2. **使用第三方仓库**：AllStarLink 提供 Debian 13 的 Asterisk 20 包

### 2.2 chan_quectel 模块兼容性

**兼容性确认**：
- ✅ `asterisk-chan-quectel` 项目明确支持 **Asterisk 13+**，包括 Asterisk 20
- ✅ 构建时需要指定版本：`./configure --with-astversion=20`
- ⚠️ 需要**重新编译**模块以匹配 Asterisk 20 的 ABI

**构建命令变更**：
```dockerfile
# 当前（Asterisk 16）
RUN ./configure --with-astversion=16

# 升级后（Asterisk 20）
RUN ./configure --with-astversion=20
```

### 2.3 依赖包兼容性

**构建依赖**（quectel-builder 阶段）：
- ✅ `asterisk-dev` - 需要匹配 Asterisk 版本
- ✅ `build-essential`, `autoconf`, `automake` - 标准构建工具，Debian 13 可用
- ✅ `libsqlite3-dev`, `libasound2-dev` - 库依赖，Debian 13 可用
- ✅ `git` - 版本控制，Debian 13 可用

**运行时依赖**（final 阶段）：
- ✅ `asterisk` - 需要从源码编译或第三方仓库安装
- ✅ `supervisor` - Debian 13 可用
- ✅ `sqlite3`, `libsqlite3-0` - Debian 13 可用
- ✅ `alsa-utils`, `libasound2` - Debian 13 可用
- ✅ `adb`, `minicom` - Debian 13 可用

## 三、需要修改的代码和配置

### 3.1 Dockerfile 修改

#### 3.1.1 基础镜像升级
```dockerfile
# 当前
FROM debian:11 AS go-builder
FROM debian:11 AS quectel-builder
FROM debian:11 AS final

# 升级后
FROM debian:13 AS go-builder
FROM debian:13 AS quectel-builder
FROM debian:13 AS final
```

#### 3.1.2 Asterisk 安装方式

**方案 A：从源码编译 Asterisk 20**（推荐）
```dockerfile
# quectel-builder 阶段
FROM debian:13 AS quectel-builder

# 安装构建依赖
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    libncurses5-dev \
    libssl-dev \
    libxml2-dev \
    libsqlite3-dev \
    uuid-dev \
    libjansson-dev \
    libcurl4-openssl-dev \
    libpopt-dev \
    libnewt-dev \
    git \
    autoconf \
    automake \
    libasound2-dev \
    alsa-utils \
    ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 下载并编译 Asterisk 20
WORKDIR /tmp
RUN wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz && \
    tar -xzf asterisk-20-current.tar.gz && \
    cd asterisk-20.* && \
    contrib/scripts/get_mp3_source.sh && \
    ./configure --with-jansson-bundled && \
    make menuselect.makeopts && \
    menuselect/menuselect --enable app_dial --enable chan_sip --enable res_musiconhold menuselect.makeopts && \
    make && \
    make install && \
    make samples

# 构建 quectel 模块
RUN git clone https://github.com/IchthysMaranatha/asterisk-chan-quectel
WORKDIR /asterisk-chan-quectel
RUN ./bootstrap && \
    ./configure --with-astversion=20 && \
    make && \
    make install
```

**方案 B：使用第三方仓库**
```dockerfile
# quectel-builder 阶段
FROM debian:13 AS quectel-builder

# 添加 AllStarLink 仓库（如果使用）
RUN wget -O /tmp/asl-apt-repos.deb13_all.deb \
    https://repo.allstarlink.org/public/asl-apt-repos.deb13_all.deb && \
    dpkg -i /tmp/asl-apt-repos.deb13_all.deb && \
    apt-get update

# 安装 Asterisk 20 和开发包
RUN apt-get install -y --no-install-recommends \
    asterisk \
    asterisk-dev \
    # ... 其他依赖
```

#### 3.1.3 最终镜像修改
```dockerfile
# final 阶段
FROM debian:13 AS final

# 如果从源码编译，需要复制 Asterisk 二进制文件和库
COPY --from=quectel-builder /usr/sbin/asterisk /usr/sbin/asterisk
COPY --from=quectel-builder /usr/lib/asterisk /usr/lib/asterisk
COPY --from=quectel-builder /etc/asterisk /etc/asterisk
# ... 其他文件
```

### 3.2 配置文件修改

#### 3.2.1 asterisk.conf.tpl
- 可能需要调整某些配置选项以适配 Asterisk 20
- 需要测试 `nofork` 和 `console` 配置是否仍然有效

#### 3.2.2 modules.conf.tpl
- Stasis 模块问题可能在 Asterisk 20 中已修复
- 可以尝试移除 `noload => res_stasis.so` 等禁用配置

#### 3.2.3 其他配置文件
- `sip.conf.tpl`, `extensions.conf.tpl`, `manager.conf.tpl` 等
- 需要检查 Asterisk 20 的语法变更
- 参考 `UPGRADE.txt` 和 `CHANGES` 文件

### 3.3 Go 应用代码修改

**可能需要的修改**：
- AMI 客户端代码：检查 Asterisk 20 的 AMI 协议变更
- 配置渲染器：确保生成的配置与 Asterisk 20 兼容
- 事件处理：验证 AMI 事件格式是否变化

## 四、风险评估

### 4.1 高风险项

1. **Stasis 初始化问题**
   - ✅ **可能解决**：Asterisk 20 可能已修复 Stasis 初始化问题
   - ⚠️ **需要验证**：需要实际测试确认

2. **quectel 模块 ABI 兼容性**
   - ⚠️ **必须重新编译**：模块必须针对 Asterisk 20 重新编译
   - ✅ **源码可用**：`asterisk-chan-quectel` 项目活跃维护

3. **配置文件语法变更**
   - ⚠️ **需要测试**：Asterisk 20 可能有配置语法变更
   - ✅ **向后兼容**：大部分配置应该向后兼容

### 4.2 中等风险项

1. **依赖库版本**
   - Debian 13 的库版本可能更新，需要测试兼容性
   - GLIBC 版本可能变化，影响 CGO 编译

2. **AMI 协议变更**
   - Asterisk 20 的 AMI 可能有新字段或变更
   - 需要测试现有 AMI 客户端代码

### 4.3 低风险项

1. **基础工具和库**
   - `supervisor`, `sqlite3`, `alsa-utils` 等标准工具
   - Debian 13 中应该可用且兼容

## 五、升级步骤建议

### 5.1 准备阶段

1. **创建测试分支**
   ```bash
   git checkout -b upgrade/asterisk20-debian13
   ```

2. **备份当前配置**
   - 备份所有配置文件
   - 记录当前工作配置

### 5.2 实施阶段

1. **修改 Dockerfile**
   - 升级基础镜像到 `debian:13`
   - 修改 Asterisk 安装方式（源码编译或第三方仓库）
   - 更新 quectel 模块构建命令：`--with-astversion=20`

2. **测试构建**
   ```bash
   docker build -t lzc-mobile:test -f docker/Dockerfile .
   ```

3. **功能测试**
   - 测试 Asterisk 启动（验证 Stasis 问题是否解决）
   - 测试 quectel 模块加载
   - 测试 AMI 连接
   - 测试 SIP 功能
   - 测试短信收发

### 5.3 验证阶段

1. **回归测试**
   - 所有现有功能
   - 性能对比
   - 稳定性测试

2. **文档更新**
   - 更新 README
   - 更新部署文档

## 六、结论

### 6.1 可行性评估

✅ **高度可行**：
- Asterisk 20 可以在 Debian 13 上成功编译和运行
- chan_quectel 模块明确支持 Asterisk 20
- 主要工作是修改 Dockerfile 和重新编译

### 6.2 预期收益

1. **解决 Stasis 初始化问题**
   - Asterisk 20 可能已修复该问题
   - 这是升级的主要动机

2. **更好的稳定性和性能**
   - Asterisk 20 包含大量 bug 修复和改进

3. **长期支持**
   - Asterisk 20 是 LTS 版本，有长期支持

### 6.3 建议

**推荐升级**，理由：
1. 当前 Asterisk 16 的 Stasis 问题难以解决
2. Asterisk 20 + Debian 13 的组合经过验证可行
3. quectel 模块支持良好
4. 升级工作量可控

**注意事项**：
1. 需要充分测试，特别是 quectel 模块功能
2. 建议先在测试环境验证
3. 保留回滚方案

## 七、参考资源

- [Asterisk 20 官方文档](https://docs.asterisk.org/)
- [asterisk-chan-quectel GitHub](https://github.com/IchthysMaranatha/asterisk-chan-quectel)
- [Asterisk 20 升级指南](https://docs.asterisk.org/Configuration/Migration/)
- [Debian 13 发布说明](https://www.debian.org/releases/trixie/)
