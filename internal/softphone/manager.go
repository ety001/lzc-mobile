package softphone

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/emiago/diago"
	"github.com/emiago/diago/audio"
	"github.com/emiago/sipgo"
	"github.com/emiago/sipgo/sip"
	"github.com/gorilla/websocket"
)

// Control message types (JSON text frames on the softphone WS).
const (
	MsgTypeStatus    = "status"
	MsgTypeCall      = "call"
	MsgTypeAnswer    = "answer"
	MsgTypeHangup    = "hangup"
	MsgTypeIncoming  = "incoming"
	MsgTypeCallState = "call_state"
	MsgTypeError     = "error"
	MsgTypePing      = "ping"
	MsgTypePong      = "pong"
)

type ControlMessage struct {
	Type    string `json:"type"`
	Number  string `json:"number,omitempty"`
	From    string `json:"from,omitempty"`
	CallID  string `json:"call_id,omitempty"`
	State   string `json:"state,omitempty"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`

	Registered bool   `json:"registered,omitempty"`
	Extension  string `json:"extension,omitempty"`
	Configured bool   `json:"configured,omitempty"`
	CallState  string `json:"call_state,omitempty"`
}

type dialogMedia interface {
	AudioReader(opts ...diago.AudioReaderOption) (io.Reader, error)
	AudioWriter(opts ...diago.AudioWriterOption) (io.Writer, error)
	Close() error
}

type callHandle struct {
	id     string
	dir    string // inbound | outbound
	from   string
	to     string
	media  dialogMedia
	hangup func(context.Context) error
	cancel context.CancelFunc
}

// Manager owns the local SIP UA (diago) and bridges WSS media.
type Manager struct {
	mu sync.Mutex

	sipHost string
	sipPort int

	bindHost string
	bindPort int

	username string
	password string
	extID    *uint

	ua     *sipgo.UserAgent
	dg     *diago.Diago
	ctx    context.Context
	cancel context.CancelFunc

	registered atomic.Bool
	call       *callHandle
	dialCancel context.CancelFunc // cancels in-flight Invite when Hangup mid-dial

	clients map[*wsClient]struct{}

	answerCh      chan struct{}
	rejectCh      chan struct{}
	activeEncoder io.Writer
}

type wsClient struct {
	conn   *websocket.Conn
	sendMu sync.Mutex
	media  atomic.Bool // whether this client receives/sends media for active call
}

var globalManager = &Manager{
	sipHost:  "127.0.0.1",
	sipPort:  5060,
	bindHost: "127.0.0.1",
	bindPort: 15070,
	clients:  make(map[*wsClient]struct{}),
	answerCh: make(chan struct{}, 1),
	rejectCh: make(chan struct{}, 1),
}

func GetManager() *Manager {
	return globalManager
}

func (m *Manager) Status() ControlMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg := ControlMessage{
		Type:       MsgTypeStatus,
		Configured: m.extID != nil && m.username != "",
		Registered: m.registered.Load(),
		Extension:  m.username,
		CallState:  "idle",
	}
	if m.call != nil {
		msg.CallState = "in_call"
		msg.CallID = m.call.id
	}
	return msg
}

// ConfigureAndStart loads extension credentials and (re)starts the UA.
// extensionID nil or 0 means Softphone disabled.
func (m *Manager) ConfigureAndStart(extensionID *uint, username, password string, sipPort int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if sipPort > 0 {
		m.sipPort = sipPort
	}

	needRestart := false
	if extensionID == nil || *extensionID == 0 || username == "" {
		m.stopLocked()
		m.extID = nil
		m.username = ""
		m.password = ""
		m.broadcastLocked(ControlMessage{Type: MsgTypeStatus, Configured: false, Registered: false, CallState: "idle"})
		return nil
	}

	if m.extID == nil || *m.extID != *extensionID || m.username != username || m.password != password {
		needRestart = true
	}
	id := *extensionID
	m.extID = &id
	m.username = username
	m.password = password

	if !needRestart && m.dg != nil {
		m.broadcastLocked(m.statusLocked())
		return nil
	}

	m.stopLocked()
	return m.startLocked()
}

func (m *Manager) stopLocked() {
	if m.dialCancel != nil {
		m.dialCancel()
		m.dialCancel = nil
	}
	if m.call != nil {
		_ = m.call.hangup(context.Background())
		if m.call.cancel != nil {
			m.call.cancel()
		}
		m.call = nil
	}
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	if m.ua != nil {
		_ = m.ua.Close()
		m.ua = nil
	}
	m.dg = nil
	m.registered.Store(false)
}

func (m *Manager) startLocked() error {
	ctx, cancel := context.WithCancel(context.Background())
	m.ctx = ctx
	m.cancel = cancel

	ua, err := sipgo.NewUA(
		sipgo.WithUserAgent(m.username),
		sipgo.WithUserAgentHostname(m.bindHost),
	)
	if err != nil {
		cancel()
		return fmt.Errorf("sip ua: %w", err)
	}
	m.ua = ua

	dg := diago.NewDiago(ua, diago.WithTransport(diago.Transport{
		Transport: "udp",
		BindHost:  m.bindHost,
		BindPort:  m.bindPort,
	}))
	m.dg = dg

	go func() {
		err := dg.Serve(ctx, func(inDialog *diago.DialogServerSession) {
			m.handleInbound(inDialog)
		})
		if err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("[softphone] serve ended: %v", err)
		}
	}()

	recipient := sip.Uri{User: m.username, Host: m.sipHost, Port: m.sipPort}
	regOpts := diago.RegisterOptions{
		Username: m.username,
		Password: m.password,
		Expiry:   60 * time.Second,
		OnRegistered: func() {
			m.registered.Store(true)
			log.Printf("[softphone] registered as %s", m.username)
			m.Broadcast(ControlMessage{
				Type:       MsgTypeStatus,
				Configured: true,
				Registered: true,
				Extension:  m.username,
				CallState:  m.callState(),
			})
		},
	}

	go func() {
		err := dg.Register(ctx, recipient, regOpts)
		if err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("[softphone] register loop ended: %v", err)
			m.registered.Store(false)
			m.Broadcast(ControlMessage{Type: MsgTypeError, Message: "SIP registration failed: " + err.Error()})
		}
	}()

	m.broadcastLocked(m.statusLocked())
	return nil
}

func (m *Manager) statusLocked() ControlMessage {
	msg := ControlMessage{
		Type:       MsgTypeStatus,
		Configured: m.extID != nil && m.username != "",
		Registered: m.registered.Load(),
		Extension:  m.username,
		CallState:  "idle",
	}
	if m.call != nil {
		msg.CallState = "in_call"
		msg.CallID = m.call.id
	}
	return msg
}

func (m *Manager) callState() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.call != nil {
		return "in_call"
	}
	return "idle"
}

func (m *Manager) Broadcast(msg ControlMessage) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.broadcastLocked(msg)
}

func (m *Manager) broadcastLocked(msg ControlMessage) {
	data, _ := json.Marshal(msg)
	for c := range m.clients {
		c.writeText(data)
	}
}

func (c *wsClient) writeText(data []byte) {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_ = c.conn.WriteMessage(websocket.TextMessage, data)
}

func (c *wsClient) writeBinary(data []byte) {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_ = c.conn.WriteMessage(websocket.BinaryMessage, data)
}

// AttachClient registers a softphone websocket client.
func (m *Manager) AttachClient(conn *websocket.Conn) *wsClient {
	c := &wsClient{conn: conn}
	m.mu.Lock()
	m.clients[c] = struct{}{}
	status := m.statusLocked()
	m.mu.Unlock()
	data, _ := json.Marshal(status)
	c.writeText(data)
	return c
}

func (m *Manager) DetachClient(c *wsClient) {
	m.mu.Lock()
	delete(m.clients, c)
	m.mu.Unlock()
}

func (m *Manager) HandleControl(c *wsClient, msg ControlMessage) {
	switch msg.Type {
	case MsgTypePing:
		c.writeText(mustJSON(ControlMessage{Type: MsgTypePong}))
	case MsgTypeCall:
		if err := m.Dial(msg.Number); err != nil {
			c.writeText(mustJSON(ControlMessage{Type: MsgTypeError, Message: err.Error()}))
		}
	case MsgTypeAnswer:
		m.signalAnswer()
	case MsgTypeHangup:
		if err := m.Hangup(); err != nil {
			c.writeText(mustJSON(ControlMessage{Type: MsgTypeError, Message: err.Error()}))
		}
	default:
		c.writeText(mustJSON(ControlMessage{Type: MsgTypeError, Message: "unknown control type: " + msg.Type}))
	}
}

func mustJSON(msg ControlMessage) []byte {
	b, _ := json.Marshal(msg)
	return b
}

func (m *Manager) signalAnswer() {
	select {
	case m.answerCh <- struct{}{}:
	default:
	}
}

func (m *Manager) Dial(number string) error {
	if number == "" {
		return errors.New("number required")
	}
	m.mu.Lock()
	if m.extID == nil || m.username == "" {
		m.mu.Unlock()
		return errors.New("softphone extension not configured")
	}
	if m.dg == nil {
		m.mu.Unlock()
		return errors.New("softphone UA not started")
	}
	if m.call != nil {
		m.mu.Unlock()
		return errors.New("already in a call")
	}
	if m.dialCancel != nil {
		m.mu.Unlock()
		return errors.New("already dialing")
	}
	dg := m.dg
	username := m.username
	password := m.password
	sipHost := m.sipHost
	sipPort := m.sipPort
	m.mu.Unlock()

	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "dialing", CallID: number})

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	m.mu.Lock()
	m.dialCancel = cancel
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		if m.dialCancel != nil {
			// Invite finished (success or fail); drop pending cancel handle.
			m.dialCancel = nil
		}
		m.mu.Unlock()
		cancel()
	}()

	recipient := sip.Uri{User: number, Host: sipHost, Port: sipPort}
	dialog, err := dg.Invite(ctx, recipient, diago.InviteOptions{
		Username:  username,
		Password:  password,
		Transport: "udp",
	})
	if err != nil {
		reason := err.Error()
		if errors.Is(err, context.Canceled) {
			reason = "cancelled"
		}
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", Reason: reason})
		return err
	}

	callCtx, callCancel := context.WithCancel(context.Background())
	h := &callHandle{
		id:     dialog.ID,
		dir:    "outbound",
		to:     number,
		media:  &dialog.DialogMedia,
		hangup: dialog.Hangup,
		cancel: callCancel,
	}

	m.mu.Lock()
	m.call = h
	m.mu.Unlock()

	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "answered", CallID: h.id})
	go m.runMediaBridge(callCtx, h)
	go func() {
		<-dialog.Context().Done()
		m.clearCall(h.id, "remote_hangup")
	}()
	return nil
}

func (m *Manager) Hangup() error {
	// If ringing inbound waiting for answer, treat hangup as reject.
	select {
	case m.rejectCh <- struct{}{}:
	default:
	}

	// Cancel in-flight outbound Invite (hangup while still dialing).
	m.mu.Lock()
	if m.dialCancel != nil {
		m.dialCancel()
		m.dialCancel = nil
	}
	call := m.call
	m.mu.Unlock()
	if call == nil {
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", Reason: "local_hangup"})
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := call.hangup(ctx)
	if call.cancel != nil {
		call.cancel()
	}
	m.clearCall(call.id, "local_hangup")
	return err
}

func (m *Manager) clearCall(id, reason string) {
	m.mu.Lock()
	if m.call == nil || m.call.id != id {
		m.mu.Unlock()
		return
	}
	if m.call.cancel != nil {
		m.call.cancel()
	}
	_ = m.call.media.Close()
	m.call = nil
	m.mu.Unlock()
	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: id, Reason: reason})
}

func (m *Manager) handleInbound(inDialog *diago.DialogServerSession) {
	_ = inDialog.Trying()
	_ = inDialog.Ringing()

	from := ""
	if hdr := inDialog.InviteRequest.From(); hdr != nil {
		from = hdr.Address.User
	}
	callID := inDialog.ID

	// drain previous signals
	select {
	case <-m.answerCh:
	default:
	}
	select {
	case <-m.rejectCh:
	default:
	}

	m.Broadcast(ControlMessage{Type: MsgTypeIncoming, From: from, CallID: callID})
	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ringing", CallID: callID, From: from})

	timer := time.NewTimer(45 * time.Second)
	defer timer.Stop()

	select {
	case <-m.answerCh:
		// continue
	case <-m.rejectCh:
		_ = inDialog.Respond(sip.StatusBusyHere, "Busy Here", nil)
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: callID, Reason: "rejected"})
		return
	case <-timer.C:
		_ = inDialog.Respond(sip.StatusRequestTimeout, "Request Timeout", nil)
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: callID, Reason: "timeout"})
		return
	case <-inDialog.Context().Done():
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: callID, Reason: "cancelled"})
		return
	}

	if err := inDialog.Answer(); err != nil {
		m.Broadcast(ControlMessage{Type: MsgTypeError, Message: "answer failed: " + err.Error()})
		return
	}

	callCtx, callCancel := context.WithCancel(context.Background())
	h := &callHandle{
		id:     callID,
		dir:    "inbound",
		from:   from,
		media:  &inDialog.DialogMedia,
		hangup: inDialog.Hangup,
		cancel: callCancel,
	}

	m.mu.Lock()
	if m.call != nil {
		m.mu.Unlock()
		_ = inDialog.Hangup(context.Background())
		callCancel()
		return
	}
	m.call = h
	m.mu.Unlock()

	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "answered", CallID: callID, From: from})
	go m.runMediaBridge(callCtx, h)
	<-inDialog.Context().Done()
	m.clearCall(callID, "remote_hangup")
}

func (m *Manager) runMediaBridge(ctx context.Context, call *callHandle) {
	props := diago.MediaProps{}
	reader, err := call.media.AudioReader(diago.WithAudioReaderMediaProps(&props))
	if err != nil {
		log.Printf("[softphone] AudioReader: %v", err)
		return
	}
	writer, err := call.media.AudioWriter()
	if err != nil {
		log.Printf("[softphone] AudioWriter: %v", err)
		return
	}

	dec, err := audio.NewPCMDecoderReader(props.Codec.PayloadType, reader)
	if err != nil {
		// fallback ulaw payload type 0
		dec, err = audio.NewPCMDecoderReader(0, reader)
		if err != nil {
			log.Printf("[softphone] PCM decoder: %v", err)
			return
		}
	}
	enc, err := audio.NewPCMEncoderWriter(props.Codec.PayloadType, writer)
	if err != nil {
		enc, err = audio.NewPCMEncoderWriter(0, writer)
		if err != nil {
			log.Printf("[softphone] PCM encoder: %v", err)
			return
		}
	}

	var seq atomic.Uint32
	go m.rtpToClients(ctx, dec, &seq)
	// uplink from clients is handled in WS read loop via PushPCM

	m.mu.Lock()
	m.activeEncoder = enc
	m.mu.Unlock()

	<-ctx.Done()

	m.mu.Lock()
	m.activeEncoder = nil
	m.mu.Unlock()
}

// PushPCM writes one PCM16 frame from a browser client into the active call.
func (m *Manager) PushPCM(payload []byte) {
	m.mu.Lock()
	enc := m.activeEncoder
	m.mu.Unlock()
	if enc == nil || len(payload) == 0 {
		return
	}
	_, _ = enc.Write(payload)
}

func (m *Manager) rtpToClients(ctx context.Context, dec *audio.PCMDecoderReader, seq *atomic.Uint32) {
	buf := make([]byte, PCMFrameBytes)
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		n, err := dec.Read(buf)
		if err != nil {
			if !errors.Is(err, io.EOF) && !errors.Is(err, context.Canceled) {
				log.Printf("[softphone] rtp read: %v", err)
			}
			return
		}
		if n <= 0 {
			continue
		}
		frame := EncodeFrame(seq.Add(1), uint32(time.Now().UnixMilli()&0xffffffff), CodecPCM16LE8k, buf[:n])
		m.mu.Lock()
		clients := make([]*wsClient, 0, len(m.clients))
		for c := range m.clients {
			clients = append(clients, c)
		}
		m.mu.Unlock()
		for _, c := range clients {
			c.writeBinary(frame)
		}
	}
}
