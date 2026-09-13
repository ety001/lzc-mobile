/**
 * Softphone audio: mic → PCM16@8kHz (20ms frames) uplink; PCM16@8kHz downlink playback.
 *
 * Uplink design notes (fixes noise + slow-mo on physical SIP phones):
 * - Resample with linear interpolation (not nearest-neighbor decimation).
 * - Use inputBuffer.sampleRate (not only AudioContext.sampleRate).
 * - Pace WS frames at exactly 20ms from an 8kHz ring buffer (no ScriptProcessor bursts).
 */

import { PCM_FRAME_SAMPLES, PCM_FRAME_BYTES } from "./frame";

const TARGET_RATE = 8000;

/** Linear-interpolation resample float32 mono → 8kHz. */
function resampleTo8k(float32, inputRate) {
  if (!float32?.length) return new Float32Array(0);
  if (!inputRate || inputRate === TARGET_RATE) {
    return float32.length ? Float32Array.from(float32) : new Float32Array(0);
  }
  const outLen = Math.max(0, Math.floor((float32.length * TARGET_RATE) / inputRate));
  if (outLen === 0) return new Float32Array(0);
  const out = new Float32Array(outLen);
  const ratio = inputRate / TARGET_RATE;
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, float32.length - 1);
    const frac = src - i0;
    out[i] = float32[i0] * (1 - frac) + float32[i1] * frac;
  }
  return out;
}

function floatToPCM16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0;
  }
  return out;
}

function pcm16ToFloat(pcm16) {
  const out = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    out[i] = pcm16[i] / 0x8000;
  }
  return out;
}

/** Explicit little-endian PCM16 bytes (avoids TypedArray endian / shared-buffer traps). */
export function pcm16ToLEBytes(pcm16) {
  const u8 = new Uint8Array(pcm16.length * 2);
  const view = new DataView(u8.buffer);
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(i * 2, pcm16[i], true);
  }
  return u8;
}

export class SoftphoneAudio {
  constructor({ onPcmFrame } = {}) {
    this.onPcmFrame = onPcmFrame;
    this.ctx = null;
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.pending8k = new Float32Array(0);
    this.playTime = 0;
    this.jitterSec = 0.06;
    this.playbackReady = false;
    this.micEnabled = false;
    this.running = false;
    this._uplinkTimer = null;
    this._uplinkQueue = []; // Int16Array frames waiting to send (max ~250ms)
  }

  async ensurePlayback() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.playbackReady = true;
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    await this.ctx.resume();
    this.playTime = this.ctx.currentTime + this.jitterSec;
    this.playbackReady = true;
  }

  _appendPending8k(chunk) {
    if (!chunk.length) return;
    const merged = new Float32Array(this.pending8k.length + chunk.length);
    merged.set(this.pending8k);
    merged.set(chunk, this.pending8k.length);
    // Cap backlog (~1s) to avoid unbounded delay if timer stalls
    if (merged.length > TARGET_RATE) {
      this.pending8k = merged.subarray(merged.length - TARGET_RATE);
    } else {
      this.pending8k = merged;
    }
  }

  _startUplinkPacer() {
    if (this._uplinkTimer) return;
    this._uplinkTimer = setInterval(() => {
      if (!this.onPcmFrame) return;
      if (!this.micEnabled && !this.running) return;

      if (this.pending8k.length >= PCM_FRAME_SAMPLES) {
        const slice = this.pending8k.subarray(0, PCM_FRAME_SAMPLES);
        this.pending8k = this.pending8k.subarray(PCM_FRAME_SAMPLES);
        const pcm = floatToPCM16(slice);
        // Keep a tiny queue so WS jitter doesn't drop frames, but bound delay.
        if (this._uplinkQueue.length < 12) {
          this._uplinkQueue.push(pcm);
        } else {
          this._uplinkQueue.shift();
          this._uplinkQueue.push(pcm);
        }
      }

      const next = this._uplinkQueue.shift();
      if (next) this.onPcmFrame(next);
    }, 20);
  }

  _stopUplinkPacer() {
    if (this._uplinkTimer) {
      clearInterval(this._uplinkTimer);
      this._uplinkTimer = null;
    }
    this._uplinkQueue = [];
    this.pending8k = new Float32Array(0);
  }

  _attachMicProcessor() {
    if (this.processor) return;
    const bufferSize = 4096;
    this.processor = this.ctx.createScriptProcessor(bufferSize, 1, 1);
    this.processor.onaudioprocess = (ev) => {
      if (!this.micEnabled && !this.running) return;
      const input = ev.inputBuffer.getChannelData(0);
      const rate = ev.inputBuffer.sampleRate || this.ctx.sampleRate || 48000;
      const down = resampleTo8k(input, rate);
      this._appendPending8k(down);
    };
    this.source.connect(this.processor);
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute);
    mute.connect(this.ctx.destination);
    this._startUplinkPacer();
  }

  /** Profile A (e59c917-style): open mic + playback together. */
  async start() {
    if (this.running && this.micEnabled) {
      if (this.ctx?.state === "suspended") await this.ctx.resume();
      return;
    }
    await this.ensurePlayback();
    await this.enableMic();
    this.running = true;
  }

  async enableMic() {
    await this.ensurePlayback();
    if (this.micEnabled && this.stream) {
      this.stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      this.micEnabled = true;
      this._startUplinkPacer();
      return;
    }

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 48000 },
        },
        video: false,
      });
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this._attachMicProcessor();
    } else {
      this.stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      this._attachMicProcessor();
    }
    this.micEnabled = true;
    this.running = true;
  }

  disableMic() {
    this.micEnabled = false;
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });
    // Keep pacer running for playback-only; just stop feeding new mic PCM.
  }

  playPcm16(pcmBytes) {
    if (!this.ctx || (!this.playbackReady && !this.running)) return;
    const aligned =
      pcmBytes.byteLength % 2 === 0 ? pcmBytes : pcmBytes.subarray(0, pcmBytes.byteLength - 1);
    const view = new DataView(aligned.buffer, aligned.byteOffset, aligned.byteLength);
    const samples = aligned.byteLength / 2;
    const floats = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      floats[i] = view.getInt16(i * 2, true) / 0x8000;
    }

    const outRate = this.ctx.sampleRate;
    const ratio = outRate / TARGET_RATE;
    const outLen = Math.floor(floats.length * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const src = i / ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, floats.length - 1);
      const frac = src - i0;
      out[i] = floats[i0] * (1 - frac) + floats[i1] * frac;
    }

    const buf = this.ctx.createBuffer(1, out.length, outRate);
    buf.copyToChannel(out, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    if (this.playTime < now) {
      this.playTime = now + 0.02;
    }
    if (this.playTime - now > 0.25) {
      this.playTime = now + this.jitterSec;
      return;
    }
    src.start(this.playTime);
    this.playTime += buf.duration;
  }

  async startRingtone() {
    this.stopRingtone();
    try {
      const audio = new Audio(`${import.meta.env.BASE_URL}sounds/ringtone.wav`);
      audio.loop = true;
      audio.volume = 0.55;
      await audio.play();
      this._ringAudio = audio;
      return;
    } catch {
      /* fall through */
    }
    await this.ensurePlayback();
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 440;
    o2.frequency.value = 480;

    const gate = ctx.createGain();
    gate.gain.value = 0;
    o1.connect(gate);
    o2.connect(gate);
    gate.connect(master);

    const cycle = 2.4;
    const on = 1.0;
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < 40; i++) {
      const start = t0 + i * cycle;
      gate.gain.setValueAtTime(0, start);
      gate.gain.linearRampToValueAtTime(1, start + 0.02);
      gate.gain.setValueAtTime(1, start + on);
      gate.gain.linearRampToValueAtTime(0, start + on + 0.05);
    }
    o1.start(t0);
    o2.start(t0);
    this._ring = { o1, o2, gate, master };
  }

  stopRingtone() {
    if (this._ringAudio) {
      try {
        this._ringAudio.pause();
        this._ringAudio.currentTime = 0;
        this._ringAudio.src = "";
      } catch {
        /* ignore */
      }
      this._ringAudio = null;
    }
    const r = this._ring;
    this._ring = null;
    if (!r) return;
    try {
      r.o1.stop();
      r.o2.stop();
    } catch {
      /* ignore */
    }
    try {
      r.o1.disconnect();
      r.o2.disconnect();
      r.gate.disconnect();
      r.master.disconnect();
    } catch {
      /* ignore */
    }
  }

  async stop() {
    this.stopRingtone();
    this._stopUplinkPacer();
    this.micEnabled = false;
    this.playbackReady = false;
    this.running = false;
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx) {
      await this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.pending8k = new Float32Array(0);
  }
}

export { PCM_FRAME_BYTES };
