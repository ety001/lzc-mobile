/**
 * Capture mic as 20ms PCM16@8kHz frames and play received PCM frames.
 * Playback can run without mic; mic defaults off until enableMic().
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
    this.playbackReady = false;
    this.micEnabled = false;
  }

  async ensurePlayback() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.playbackReady = true;
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.playTime = this.ctx.currentTime + this.jitterSec;
    this.playbackReady = true;
  }

  /** @deprecated use ensurePlayback + enableMic */
  async start() {
    await this.ensurePlayback();
    await this.enableMic();
  }

  async enableMic() {
    await this.ensurePlayback();
    if (this.micEnabled && this.stream) {
      this.stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      this.micEnabled = true;
      return;
    }

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
        video: false,
      });
      this.source = this.ctx.createMediaStreamSource(this.stream);

      const bufferSize = 4096;
      this.processor = this.ctx.createScriptProcessor(bufferSize, 1, 1);
      this.processor.onaudioprocess = (ev) => {
        if (!this.micEnabled || !this.onPcmFrame) return;
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
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      this.processor.connect(mute);
      mute.connect(this.ctx.destination);
    } else {
      this.stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
    }
    this.micEnabled = true;
  }

  disableMic() {
    this.micEnabled = false;
    this.pending = new Float32Array(0);
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });
  }

  playPcm16(pcmBytes) {
    if (!this.ctx || !this.playbackReady) return;
    const aligned = pcmBytes.byteLength % 2 === 0 ? pcmBytes : pcmBytes.subarray(0, pcmBytes.byteLength - 1);
    const pcm16 = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);
    const floats = pcm16ToFloat(pcm16);

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
    if (this.playTime - now > 0.25) {
      this.playTime = now + this.jitterSec;
      return;
    }
    src.start(this.playTime);
    this.playTime += buf.duration;
  }

  async stop() {
    this.micEnabled = false;
    this.playbackReady = false;
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
