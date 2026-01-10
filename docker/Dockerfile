# 阶段一：构建 Go 应用
FROM golang:1.25-bookworm AS go-builder

WORKDIR /build

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    gcc \
    libc6-dev \
    libsqlite3-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 复制 go mod 文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 构建 Go 应用（启用 CGO，在 Debian 下使用动态链接，与最终镜像兼容）
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o bin/webpanel ./cmd/webpanel




# 阶段二：构建前端
FROM node:20-alpine3.23 AS frontend-builder

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





# 阶段三：构建 quectel 模块
FROM debian:11 AS quectel-builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    asterisk \
    asterisk-dev \
    git \
    autoconf \
    automake \
    libsqlite3-dev \
    build-essential \
    libasound2-dev \
    alsa-utils \
    ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/IchthysMaranatha/asterisk-chan-quectel

WORKDIR /asterisk-chan-quectel

RUN ./bootstrap
RUN ./configure --with-astversion=16
RUN make
RUN make install






# 阶段四：最终镜像
FROM debian:11 AS final

# 安装基础依赖和 Asterisk
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    asterisk \
    supervisor \
    ca-certificates \
    sqlite3 \
    libsqlite3-0 \
    bash \
    curl \
    adb \
    alsa-utils \
    libasound2 \
    minicom && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 将 asterisk 用户添加到 dialout 组，以便访问串口设备（ttyUSB）
# dialout 组是 Linux 系统中串口设备的默认组
RUN usermod -a -G dialout asterisk

# 从 quectel 构建阶段复制模块和配置
COPY --from=quectel-builder /asterisk-chan-quectel/uac/quectel.conf /etc/asterisk/quectel.conf
COPY --from=quectel-builder /usr/lib/asterisk/modules/chan_quectel.so /usr/lib/asterisk/modules/chan_quectel.so

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
