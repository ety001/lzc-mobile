/**
 * Capture mic as 20ms PCM16@8kHz frames and play received PCM frames.
 * Uses AudioWorklet when available, falls back to ScriptProcessor.
 */

import { PCM_FRAME_SAMPLES, PCM_FRAME_BYTES } from "./frame";

function downsampleTo8k(float32, inputRate) {
  if (inputRate === 8000) {
    return float32;
  }
  const ratio = inputRate / 8000;
  const outLen = Math.floor(float32.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = float32[Math.floor(i * ratio)] || 0;
  }
  return out;
}

function floatToPCM16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
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

export class SoftphoneAudio {
  constructor({ onPcmFrame } = {}) {
    this.onPcmFrame = onPcmFrame;
    this.ctx = null;
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.pending = new Float32Array(0);
    this.playTime = 0;
    this.jitterSec = 0.06;
    this.running = false;
  }

  async start() {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
      video: false,
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);

    const bufferSize = 4096;
    this.processor = this.ctx.createScriptProcessor(bufferSize, 1, 1);
    this.processor.onaudioprocess = (ev) => {
      if (!this.running || !this.onPcmFrame) return;
      const input = ev.inputBuffer.getChannelData(0);
      const down = downsampleTo8k(input, this.ctx.sampleRate);
      const merged = new Float32Array(this.pending.length + down.length);
      merged.set(this.pending);
      merged.set(down, this.pending.length);
      let offset = 0;
      while (merged.length - offset >= PCM_FRAME_SAMPLES) {
        const slice = merged.subarray(offset, offset + PCM_FRAME_SAMPLES);
        const pcm = floatToPCM16(slice);
        this.onPcmFrame(pcm);
        offset += PCM_FRAME_SAMPLES;
      }
      this.pending = merged.subarray(offset);
    };

    this.source.connect(this.processor);
    // Avoid mic monitor feedback: process without audible local loopback.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute);
    mute.connect(this.ctx.destination);
    this.playTime = this.ctx.currentTime + this.jitterSec;
    this.running = true;
  }

  playPcm16(pcmBytes) {
    if (!this.ctx || !this.running) return;
    const aligned = pcmBytes.byteLength % 2 === 0 ? pcmBytes : pcmBytes.subarray(0, pcmBytes.byteLength - 1);
    const pcm16 = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);
    const floats = pcm16ToFloat(pcm16);

    // Resample 8k -> AudioContext rate via simple hold
    const ratio = this.ctx.sampleRate / 8000;
    const outLen = Math.floor(floats.length * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      out[i] = floats[Math.floor(i / ratio)] || 0;
    }

    const buf = this.ctx.createBuffer(1, out.length, this.ctx.sampleRate);
    buf.copyToChannel(out, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    if (this.playTime < now) {
      this.playTime = now + 0.02;
    }
    // Drop if backlog too large (>250ms)
    if (this.playTime - now > 0.25) {
      this.playTime = now + this.jitterSec;
      return;
    }
    src.start(this.playTime);
    this.playTime += buf.duration;
  }

  async stop() {
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
    this.pending = new Float32Array(0);
  }
}

export { PCM_FRAME_BYTES };
