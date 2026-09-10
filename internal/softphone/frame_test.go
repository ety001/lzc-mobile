package softphone

import (
	"bytes"
	"testing"
)

func TestFrameRoundTrip(t *testing.T) {
	payload := bytes.Repeat([]byte{0x01, 0x02}, 160)
	encoded := EncodeFrame(42, 123456789, CodecPCM16LE8k, payload)
	f, err := DecodeFrame(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if f.Seq != 42 || f.TsMs != 123456789 || f.Codec != CodecPCM16LE8k {
		t.Fatalf("header mismatch: %+v", f)
	}
	if !bytes.Equal(f.Payload, payload) {
		t.Fatal("payload mismatch")
	}
}

func TestFrameTooShort(t *testing.T) {
	_, err := DecodeFrame([]byte{1, 2, 3})
	if err == nil {
		t.Fatal("expected error")
	}
}
