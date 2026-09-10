import { encodeFrame, decodeFrame, CODEC_PCM16_8K } from "./frame";
import { SoftphoneAudio } from "./audio";

function softphoneWsURL(path = "/api/v1/softphone/ws") {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

/**
 * SoftphoneSDK — browser call-control + PCM-over-WSS (not WebRTC).
 */
export class SoftphoneSDK {
  constructor() {
    this.ws = null;
    this.audio = null;
    this.seq = 0;
    this.listeners = new Map();
    this.state = {
      configured: false,
      registered: false,
      extension: "",
      callState: "idle",
      lastError: "",
    };
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(e);
      }
    });
  }

  getState() {
    return { ...this.state };
  }

  async connect() {
    if (this.ws && this.ws.readyState <= 1) return;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(softphoneWsURL());
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      const onErr = (e) => reject(e?.message || "websocket failed");
      ws.addEventListener("error", onErr, { once: true });
      ws.addEventListener("open", () => {
        ws.removeEventListener("error", onErr);
        resolve();
      }, { once: true });

      ws.onmessage = (ev) => this.#onMessage(ev);
      ws.onclose = () => {
        this.emit("close");
        this.#stopAudio();
      };
    });

    this.audio = new SoftphoneAudio({
      onPcmFrame: (pcm16) => this.#sendPcm(pcm16),
    });
  }

  async enableMic() {
    if (!this.audio) throw new Error("not connected");
    await this.audio.start();
  }

  disconnect() {
    this.#stopAudio();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  call(number) {
    this.#sendJSON({ type: "call", number });
  }

  answer() {
    this.#sendJSON({ type: "answer" });
  }

  hangup() {
    this.#sendJSON({ type: "hangup" });
  }

  ping() {
    this.#sendJSON({ type: "ping" });
  }

  /**
   * Inject a short uplink sine tone (no mic needed) to verify WSS→RTP→PSTN.
   * Returns a cancel function.
   */
  sendTestTone({ freqHz = 440, durationMs = 3000, amplitude = 0.28 } = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("websocket not open");
    }
    const total = Math.floor((8000 * durationMs) / 1000);
    let sent = 0;
    const tick = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || sent >= total) {
        clearInterval(timer);
        return;
      }
      const pcm = new Int16Array(160);
      for (let i = 0; i < 160; i++) {
        const t = (sent + i) / 8000;
        const s = Math.sin(2 * Math.PI * freqHz * t) * amplitude;
        pcm[i] = (s < 0 ? s * 0x8000 : s * 0x7fff) | 0;
      }
      sent += 160;
      this.#sendPcm(pcm);
    };
    const timer = setInterval(tick, 20);
    tick();
    return () => clearInterval(timer);
  }

  #sendJSON(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("websocket not open");
    }
    this.ws.send(JSON.stringify(obj));
  }

  #sendPcm(pcm16) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq = (this.seq + 1) >>> 0;
    const frame = encodeFrame(this.seq, Date.now() >>> 0, CODEC_PCM16_8K, pcm16);
    this.ws.send(frame);
  }

  async #stopAudio() {
    if (this.audio) {
      await this.audio.stop();
      this.audio = null;
    }
  }

  #onMessage(ev) {
    if (typeof ev.data === "string") {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.#applyControl(msg);
      this.emit("message", msg);
      if (msg.type) this.emit(msg.type, msg);
      return;
    }
    try {
      const frame = decodeFrame(ev.data);
      if (frame.codec === CODEC_PCM16_8K && this.audio) {
        this.audio.playPcm16(frame.payload);
      }
      this.emit("media", frame);
    } catch {
      /* ignore bad frames */
    }
  }

  #applyControl(msg) {
    if (msg.type === "status") {
      this.state.configured = !!msg.configured;
      this.state.registered = !!msg.registered;
      this.state.extension = msg.extension || "";
      this.state.callState = msg.call_state || "idle";
    }
    if (msg.type === "call_state") {
      this.state.callState = msg.state || this.state.callState;
    }
    if (msg.type === "error") {
      this.state.lastError = msg.message || "error";
    }
    this.emit("state", this.getState());
  }
}

/**
 * Spike A helper: echo WS latency probe.
 */
export async function runEchoProbe({ durationMs = 5000, onSample } = {}) {
  const url = softphoneWsURL("/api/v1/softphone/spike/echo-ws");
  const samples = [];

  const ws = await new Promise((resolve, reject) => {
    const sock = new WebSocket(url);
    sock.binaryType = "arraybuffer";
    sock.addEventListener("open", () => resolve(sock), { once: true });
    sock.addEventListener("error", () => reject(new Error("echo ws failed")), { once: true });
  });

  let seq = 0;
  const pending = new Map();

  ws.onmessage = (ev) => {
    try {
      const frame = decodeFrame(ev.data);
      const sent = pending.get(frame.seq);
      if (sent == null) return;
      pending.delete(frame.seq);
      const rtt = performance.now() - sent;
      const oneWay = rtt / 2;
      samples.push(oneWay);
      onSample?.(oneWay, samples.length);
    } catch {
      /* ignore */
    }
  };

  const timer = setInterval(() => {
    seq = (seq + 1) >>> 0;
    const pcm = new Int16Array(160);
    pending.set(seq, performance.now());
    ws.send(encodeFrame(seq, Date.now() >>> 0, CODEC_PCM16_8K, pcm));
  }, 20);

  await new Promise((r) => setTimeout(r, durationMs));
  clearInterval(timer);
  ws.close();

  samples.sort((a, b) => a - b);
  const pct = (p) => samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))] || 0;
  return {
    count: samples.length,
    p50: pct(50),
    p95: pct(95),
    max: samples[samples.length - 1] || 0,
  };
}

export default SoftphoneSDK;
