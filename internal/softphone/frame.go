package softphone

import (
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	FrameVersion = 1
	HeaderSize   = 10 // version(1)+seq(4)+ts_ms(4)+codec(1)

	CodecPCM16LE8k = 0 // mono PCM16 little-endian @ 8kHz
)

var (
	ErrFrameTooShort = errors.New("softphone frame too short")
	ErrBadVersion    = errors.New("unsupported softphone frame version")
)

// Frame is the WSS binary media frame.
// Layout: version(1) | seq(uint32 BE) | ts_ms(uint32 BE) | codec(1) | payload
type Frame struct {
	Version uint8
	Seq     uint32
	TsMs    uint32
	Codec   uint8
	Payload []byte
}

func EncodeFrame(seq, tsMs uint32, codec uint8, payload []byte) []byte {
	out := make([]byte, HeaderSize+len(payload))
	out[0] = FrameVersion
	binary.BigEndian.PutUint32(out[1:5], seq)
	binary.BigEndian.PutUint32(out[5:9], tsMs)
	out[9] = codec
	copy(out[HeaderSize:], payload)
	return out
}

func DecodeFrame(data []byte) (Frame, error) {
	if len(data) < HeaderSize {
		return Frame{}, ErrFrameTooShort
	}
	f := Frame{
		Version: data[0],
		Seq:     binary.BigEndian.Uint32(data[1:5]),
		TsMs:    binary.BigEndian.Uint32(data[5:9]),
		Codec:   data[9],
		Payload: append([]byte(nil), data[HeaderSize:]...),
	}
	if f.Version != FrameVersion {
		return Frame{}, fmt.Errorf("%w: %d", ErrBadVersion, f.Version)
	}
	return f, nil
}

// PCMFrameBytes is 20ms of mono PCM16 @ 8kHz.
const PCMFrameBytes = 320 // 160 samples * 2 bytes
