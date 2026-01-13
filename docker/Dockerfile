# 阶段一：构建 Go 应用
# 使用 debian:13 作为基础镜像，手动安装 Go 1.25，确保 GLIBC 版本与最终镜像完全一致
FROM debian:13 AS go-builder

WORKDIR /build

# 安装构建依赖和 Go 1.25
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    git \
    gcc \
    libc6-dev \
    libsqlite3-dev \
    ca-certificates && \
    wget -O go.tar.gz https://go.dev/dl/go1.25.5.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 设置 Go 环境变量
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH=/go
ENV CGO_ENABLED=1

# 复制 go mod 文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 构建 Go 应用（启用 CGO，在 Debian 13 下使用动态链接，与最终镜像兼容）
RUN go build -a -installsuffix cgo -o bin/webpanel ./cmd/webpanel




# 阶段二：构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# 安装 pnpm
RUN npm install -g pnpm

# 复制前端 package.json（先复制依赖文件以利用缓存）
COPY internal/frontend/package.json ./

# 安装依赖（如果存在 pnpm-lock.yaml 会使用它）
COPY internal/frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# 复制前端源代码
COPY internal/frontend/ ./

# 构建前端（临时修改输出目录为 ./dist，因为 vite.config.js 配置的是 ../../web/dist）
RUN sed -i 's|outDir:.*|outDir: "./dist",|' vite.config.js && pnpm build




# 阶段三：构建 Asterisk 20（从源码编译）
# 使用 ARG 定义版本，便于缓存和版本管理
# 可以使用 asterisk-20-current.tar.gz 自动获取最新版本，或指定具体版本如 20.11.1
ARG ASTERISK_SOURCE_URL=https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
FROM debian:13 AS asterisk-builder

ARG ASTERISK_SOURCE_URL

# 安装构建依赖（分离依赖安装，便于缓存）
# 这些依赖不经常变化，可以很好地利用缓存
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
    libedit-dev \
    libical-dev \
    libspeex-dev \
    libspeexdsp-dev \
    libcodec2-dev \
    libgsm1-dev \
    libmpg123-dev \
    libmp3lame-dev \
    libvorbis-dev \
    libogg-dev \
    libsrtp2-dev \
    libresample-dev \
    libsndfile1-dev \
    libsamplerate0-dev \
    libavcodec-dev \
    libavformat-dev \
    libswresample-dev \
    libavutil-dev \
    libavfilter-dev \
    libavdevice-dev \
    libavresample-dev \
    libpostproc-dev \
    libbluetooth-dev \
    libcap-dev \
    ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 下载 Asterisk 源码（分离下载步骤，便于缓存）
# 使用 ARG 传入的 URL，支持灵活指定版本
WORKDIR /tmp
RUN wget -q -O asterisk.tar.gz "${ASTERISK_SOURCE_URL}" && \
    tar -xzf asterisk.tar.gz && \
    rm asterisk.tar.gz && \
    mv asterisk-* asterisk-src

# 编译 Asterisk（分离编译步骤）
WORKDIR /tmp/asterisk-src

# 下载 MP3 源码（如果需要）
RUN contrib/scripts/get_mp3_source.sh || true

# 配置 Asterisk（分离配置步骤）
RUN ./configure \
    --with-jansson-bundled \
    --with-pjproject-bundled \
    --prefix=/usr \
    --sysconfdir=/etc \
    --localstatedir=/var \
    --with-ssl \
    --with-z \
    --with-pjproject-bundled

# 选择要编译的模块（优化编译时间）
# 注意：Asterisk 20 中启用了 res_stasis 和 app_stasis，因为 Stasis 问题应该已修复
RUN make menuselect.makeopts && \
    menuselect/menuselect \
    --enable app_dial \
    --enable app_voicemail \
    --enable chan_sip \
    --enable chan_iax2 \
    --enable res_musiconhold \
    --enable res_agi \
    --enable res_stasis \
    --enable app_stasis \
    menuselect.makeopts

# 编译 Asterisk（这是最耗时的步骤，放在最后）
RUN make -j$(nproc)

# 安装 Asterisk（但不安装到系统目录，而是安装到临时目录）
RUN make install DESTDIR=/tmp/asterisk-install

# 生成示例配置文件
RUN make samples DESTDIR=/tmp/asterisk-install




# 阶段四：构建 quectel 模块
# 基于 asterisk-builder，使用已编译的 Asterisk
FROM debian:13 AS quectel-builder

# 安装构建依赖（与 asterisk-builder 类似，但只需要基本工具）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    autoconf \
    automake \
    libtool \
    build-essential \
    libasound2-dev \
    ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 从 asterisk-builder 复制 Asterisk 开发文件
COPY --from=asterisk-builder /tmp/asterisk-install/usr /usr
COPY --from=asterisk-builder /tmp/asterisk-install/etc /etc

# 下载 quectel 源码（分离下载步骤）
WORKDIR /tmp
RUN git clone --depth 1 https://github.com/IchthysMaranatha/asterisk-chan-quectel

# 构建 quectel 模块
WORKDIR /tmp/asterisk-chan-quectel
RUN ./bootstrap && \
    ./configure --with-astversion=20 && \
    make -j$(nproc) && \
    make install DESTDIR=/tmp/quectel-install

# 安装到临时目录（不安装到系统）
RUN mkdir -p /tmp/quectel-install/usr/lib/asterisk/modules && \
    cp chan_quectel.so /tmp/quectel-install/usr/lib/asterisk/modules/ && \
    mkdir -p /tmp/quectel-install/etc/asterisk && \
    cp uac/quectel.conf /tmp/quectel-install/etc/asterisk/quectel.conf || true




# 阶段五：最终镜像
FROM debian:13 AS final

# 安装运行时依赖（最小化依赖）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    supervisor \
    ca-certificates \
    sqlite3 \
    libsqlite3-0 \
    bash \
    curl \
    adb \
    alsa-utils \
    libasound2 \
    minicom \
    libncurses6 \
    libssl3 \
    libxml2 \
    libuuid1 \
    libjansson4 \
    libcurl4 \
    libpopt0 \
    libnewt0.52 \
    libedit2 \
    libical3 \
    libspeex1 \
    libspeexdsp1 \
    libcodec2-1.0 \
    libgsm1 \
    libmpg123-0 \
    libmp3lame0 \
    libvorbis0a \
    libogg0 \
    libsrtp2-1 \
    libsndfile1 \
    libsamplerate0 \
    libavcodec60 \
    libavformat60 \
    libswresample4 \
    libavutil58 \
    libavfilter9 \
    libavdevice60 \
    libavresample4 \
    libpostproc57 \
    libbluetooth1 \
    libcap2 \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 从 asterisk-builder 复制 Asterisk 二进制文件和库
COPY --from=asterisk-builder /tmp/asterisk-install/usr/sbin/asterisk /usr/sbin/asterisk
COPY --from=asterisk-builder /tmp/asterisk-install/usr/lib/asterisk /usr/lib/asterisk
COPY --from=asterisk-builder /tmp/asterisk-install/etc/asterisk /etc/asterisk

# 从 quectel-builder 复制 quectel 模块
COPY --from=quectel-builder /tmp/quectel-install/usr/lib/asterisk/modules/chan_quectel.so /usr/lib/asterisk/modules/chan_quectel.so
COPY --from=quectel-builder /tmp/quectel-install/etc/asterisk/quectel.conf /etc/asterisk/quectel.conf

# 从 Go 构建阶段复制二进制文件
COPY --from=go-builder /build/bin/webpanel /app/bin/webpanel

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /build/dist /app/web/dist

# 复制配置文件
COPY configs/asterisk/ /app/configs/asterisk/
COPY configs/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 复制启动脚本
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 将 asterisk 用户添加到 dialout 组，以便访问串口设备（ttyUSB）
# dialout 组是 Linux 系统中串口设备的默认组
RUN usermod -a -G dialout asterisk

# 创建必要的目录
RUN mkdir -p /var/lib/lzc-mobile \
    /etc/asterisk \
    /var/log/asterisk \
    /var/run/asterisk \
    /var/log/supervisor

# 暴露端口
# SIP TCP 端口（默认 5060）
#EXPOSE 5060/tcp
# RTP UDP 端口范围（默认 40890-40900）
#EXPOSE 40890-40900/udp
# Web 管理端口（默认 8071）
#EXPOSE 8071/tcp

# 设置环境变量
ENV WEB_PORT=8071
ENV DB_PATH=/var/lib/lzc-mobile/data.db
ENV ASTERISK_CONFIG_DIR=/etc/asterisk
ENV ASTERISK_TEMPLATE_DIR=/app/configs/asterisk
ENV ASTERISK_LOG_PATH=/var/log/asterisk/full

# 启动脚本
ENTRYPOINT ["/entrypoint.sh"]
