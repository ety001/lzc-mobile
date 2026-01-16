#
# Experimental build: Alpine 3.23 + official Asterisk package
# Goal: verify that packaged Asterisk does NOT hit the Stasis XML doc issue
#

############################
# Frontend builder
############################
FROM node:20-alpine AS frontend-builder

WORKDIR /build

RUN npm install -g pnpm
COPY internal/frontend/package.json ./
COPY internal/frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY internal/frontend/ ./
RUN sed -i 's|outDir:.*|outDir: "./dist",|' vite.config.js && pnpm build


############################
# Go builder (musl)
############################
FROM golang:1.25-alpine AS go-builder

WORKDIR /build

# CGO build deps for sqlite (go-sqlite3) on musl
RUN apk add --no-cache \
    git \
    build-base \
    sqlite-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o bin/webpanel ./cmd/webpanel


############################
# chan_quectel builder (against packaged Asterisk headers)
############################
FROM alpine:3.23.2 AS quectel-builder

WORKDIR /tmp

RUN apk add --no-cache \
    git \
    autoconf \
    automake \
    libtool \
    build-base \
    sqlite-dev \
    alsa-lib-dev \
    asterisk-dev

RUN git clone --depth 1 https://github.com/IchthysMaranatha/asterisk-chan-quectel
WORKDIR /tmp/asterisk-chan-quectel

# Note: alpine asterisk is 20.x, build module as 20
RUN ./bootstrap && \
    ./configure --with-astversion=20 --with-asterisk=/usr/include && \
    make -j$(nproc)


############################
# Final runtime
############################
FROM alpine:3.23.2

WORKDIR /app

RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    sqlite \
    supervisor \
    alsa-utils \
    asterisk \
    asterisk-alsa \
    asterisk-curl \
    asterisk-odbc \
    asterisk-sample-config

# Copy built quectel module (Alpine packaged Asterisk module dir)
RUN mkdir -p /usr/lib/asterisk/modules
COPY --from=quectel-builder /tmp/asterisk-chan-quectel/chan_quectel.so /usr/lib/asterisk/modules/chan_quectel.so

# Copy app binaries/assets
COPY --from=go-builder /build/bin/webpanel /app/webpanel
COPY --from=frontend-builder /build/dist /app/dist

# App configs/scripts (same layout as Debian image)
COPY configs/asterisk/ /app/configs/asterisk/
COPY configs/supervisor/supervisord.conf /etc/supervisord.conf
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create runtime dirs (keep same paths as current project expects)
RUN mkdir -p \
    /var/lib/lzc-mobile \
    /var/log/asterisk \
    /var/run/asterisk \
    /var/spool/asterisk \
    /var/log/supervisor

EXPOSE 8071

ENTRYPOINT ["/entrypoint.sh"]

