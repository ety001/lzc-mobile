package ami

import "errors"

var (
	// ErrNotConnected AMI 客户端未连接
	ErrNotConnected = errors.New("AMI client is not connected")
)
