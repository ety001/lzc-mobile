# softphone

Go SIP UA + WSS media bridge for browser Softphone (443-only).

## Architecture

- Browser ↔ Gin: JSON call-control + PCM16 frames over WSS
- Go (diago) ↔ Asterisk: SIP REGISTER/INVITE + RTP on localhost
- No browser WebRTC / ICE

## Frame format

```
version(1) | seq(uint32 BE) | ts_ms(uint32 BE) | codec(1) | payload
codec 0 = PCM16LE mono @ 8kHz, typically 320 bytes (20ms)
```

## Endpoints

- `GET /api/v1/softphone/status`
- `GET /api/v1/softphone/ws` — requires Softphone extension configured
- `GET /api/v1/softphone/spike/echo-ws` — latency echo probe
