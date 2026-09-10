# Softphone Spike 记录

分支：`feat/web-sip-over-https`

## 验证清单

| ID | 内容 | 实现 | 实网验收 |
|----|------|------|----------|
| A | WSS PCM echo + 延迟 | `/api/v1/softphone/spike/echo-ws` + Softphone 页探测 | 需在 `https://lzcmobile.<box>.heiyu.space` 测 p50/p95 |
| B | Go SIP UA 本机注册 | `internal/softphone` + diago Register | 配置 Softphone 分机后看 `pjsip show contacts` |
| C | 本机 RTP 呼叫腿 | Dial / inbound Answer + diago media | 对 MizuDroid 或另一分机试听 |
| D | WSS↔RTP 桥 | Softphone WS binary PCM ↔ AudioReader/Writer | Softphone 页双向通话 ≥30s |

## 选用库

- SIP/RTP：`github.com/emiago/diago`（基于 sipgo）
- 帧：PCM16LE @ 8kHz，20ms，自定义 WSS binary header

## 产品规则

- Softphone 分机必须在设置中显式指定；未指定则 `/softphone/ws` 拒绝连接
- 浏览器无 WebRTC；媒体仅同源 WSS
