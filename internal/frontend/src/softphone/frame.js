/**
 * Softphone frame codec: version(1)+seq(u32 BE)+ts_ms(u32 BE)+codec(1)+payload
 * codec 0 = PCM16LE mono @ 8kHz
 */

export const FRAME_VERSION = 1;
export const CODEC_PCM16_8K = 0;
export const HEADER_SIZE = 10;
export const PCM_FRAME_SAMPLES = 160; // 20ms @ 8kHz
export const PCM_FRAME_BYTES = PCM_FRAME_SAMPLES * 2;

export function encodeFrame(seq, tsMs, codec, payload) {
  const bytes =
    payload instanceof Uint8Array
      ? payload
      : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  const out = new Uint8Array(HEADER_SIZE + bytes.byteLength);
  const view = new DataView(out.buffer);
  out[0] = FRAME_VERSION;
  view.setUint32(1, seq >>> 0);
  view.setUint32(5, tsMs >>> 0);
  out[9] = codec;
  out.set(bytes, HEADER_SIZE);
  return out;
}

export function decodeFrame(buf) {
  const data = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf);
  if (data.byteLength < HEADER_SIZE) throw new Error("frame too short");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = data[0];
  if (version !== FRAME_VERSION) throw new Error(`bad frame version ${version}`);
  return {
    version,
    seq: view.getUint32(1),
    tsMs: view.getUint32(5),
    codec: data[9],
    payload: data.subarray(HEADER_SIZE),
  };
}
