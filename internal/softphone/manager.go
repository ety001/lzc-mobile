package softphone

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
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
	MsgTypeDTMF      = "dtmf"
	MsgTypeIncoming  = "incoming"
	MsgTypeCallState = "call_state"
	MsgTypeError     = "error"
	MsgTypePing      = "ping"
	MsgTypePong      = "pong"
)

type ControlMessage struct {
	Type    string `json:"type"`
	Number  string `json:"number,omitempty"`
	Digit   string `json:"digit,omitempty"` // DTMF: 0-9, *, #, A-D
	From    string `json:"from,omitempty"`
	CallID  string `json:"call_id,omitempty"`
	State   string `json:"state,omitempty"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`

	Registered bool   `json:"registered,omitempty"`
	Extension  string `json:"extension,omitempty"`
	Configured bool   `json:"configured,omitempty"`
	CallState  string `json:"call_state,omitempty"`
	// AudioABProfile mirrors GlobalConfig for Softphone A/B mic/media path.
	AudioABProfile string `json:"audio_ab_profile,omitempty"`
}

// IncomingCallHook is invoked when the softphone UA receives an INVITE (optional).
// Used by the web layer to push LazyCat client notifications.
var IncomingCallHook func(from string)

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

	// Pending inbound ring (before answer). Replayed to newly attached WS clients
	// so LazyCat notification deeplink can still show Answer UI.
	ringing      bool
	ringingFrom  string
	ringingCallID string

	clients map[*wsClient]struct{}

	answerCh      chan struct{}
	rejectCh      chan struct{}
	activeEncoder io.Writer
	activeDTMF    *diago.DTMFWriter
	pcmIn         chan []byte // paced uplink frames (20ms PCM16)

	audioABProfile string // A | B, set from GlobalConfig
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
	pcmIn:    make(chan []byte, 50),
}

func GetManager() *Manager {
	return globalManager
}

func (m *Manager) Status() ControlMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.statusLocked()
}

func (m *Manager) statusLocked() ControlMessage {
	msg := ControlMessage{
		Type:           MsgTypeStatus,
		Configured:     m.extID != nil && m.username != "",
		Registered:     m.registered.Load(),
		Extension:      m.username,
		CallState:      "idle",
		AudioABProfile: m.audioABProfile,
	}
	if msg.AudioABProfile == "" {
		msg.AudioABProfile = "A"
	}
	if m.call != nil {
		msg.CallState = "in_call"
		msg.CallID = m.call.id
		if m.call.from != "" {
			msg.From = m.call.from
		}
	} else if m.ringing {
		msg.CallState = "ringing"
		msg.CallID = m.ringingCallID
		msg.From = m.ringingFrom
	}
	return msg
}

// SetAudioABProfile updates the Softphone-side A/B profile (A=legacy auto-mic path).
func (m *Manager) SetAudioABProfile(profile string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if profile == "B" || profile == "b" {
		m.audioABProfile = "B"
	} else {
		m.audioABProfile = "A"
	}
}

func (m *Manager) clearRingingLocked() {
	m.ringing = false
	m.ringingFrom = ""
	m.ringingCallID = ""
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
	// diago/sipgo may take a moment to release the UDP bind after Close.
	waitUDPPortFree(m.bindHost, m.bindPort, 3*time.Second)
}

func (m *Manager) startLocked() error {
	if err := waitUDPPortFree(m.bindHost, m.bindPort, 3*time.Second); err != nil {
		return fmt.Errorf("softphone udp bind %s:%d still busy: %w", m.bindHost, m.bindPort, err)
	}

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

	username := m.username
	password := m.password
	sipHost := m.sipHost
	sipPort := m.sipPort
	extID := *m.extID

	// ServeBackground waits until the UDP listener is in sipgo's connection pool.
	// Register must reuse that socket (same BindPort); racing go Serve+Register causes
	// "listen udp 127.0.0.1:15070: bind: address already in use" and permanent unreg.
	if err := dg.ServeBackground(ctx, func(inDialog *diago.DialogServerSession) {
		m.handleInbound(inDialog)
	}); err != nil {
		cancel()
		_ = ua.Close()
		m.ua = nil
		m.dg = nil
		m.cancel = nil
		return fmt.Errorf("sip serve: %w", err)
	}

	recipient := sip.Uri{User: username, Host: sipHost, Port: sipPort}
	regOpts := diago.RegisterOptions{
		Username: username,
		Password: password,
		Expiry:   60 * time.Second,
		OnRegistered: func() {
			m.registered.Store(true)
			log.Printf("[softphone] registered as %s", username)
			m.Broadcast(ControlMessage{
				Type:       MsgTypeStatus,
				Configured: true,
				Registered: true,
				Extension:  username,
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
			m.scheduleRestart(extID, username, password, sipPort, err)
		}
	}()

	m.broadcastLocked(m.statusLocked())
	return nil
}

// scheduleRestart recovers from unexpected serve/register death (e.g. UDP bind race).
// Without this, Asterisk contact expires and extension-to-extension dials get CHANUNAVAIL.
func (m *Manager) scheduleRestart(extID uint, username, password string, sipPort int, cause error) {
	go func() {
		time.Sleep(2 * time.Second)
		m.mu.Lock()
		if m.extID == nil || *m.extID != extID || m.username != username || m.password != password {
			m.mu.Unlock()
			return
		}
		// Already running a healthy UA for this config.
		if m.dg != nil && m.registered.Load() {
			m.mu.Unlock()
			return
		}
		log.Printf("[softphone] restarting UA after failure: %v", cause)
		m.stopLocked()
		err := m.startLocked()
		m.mu.Unlock()
		if err != nil {
			log.Printf("[softphone] restart failed: %v", err)
			m.scheduleRestart(extID, username, password, sipPort, err)
		}
	}()
}

func waitUDPPortFree(host string, port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	addr := fmt.Sprintf("%s:%d", host, port)
	for {
		if udpBindAvailable(host, port) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("port %s still in use", addr)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func udpBindAvailable(host string, port int) bool {
	pc, err := net.ListenPacket("udp", fmt.Sprintf("%s:%d", host, port))
	if err != nil {
		return false
	}
	_ = pc.Close()
	return true
}

func (m *Manager) callState() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.call != nil {
		return "in_call"
	}
	if m.ringing {
		return "ringing"
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
	ringing := m.ringing
	from := m.ringingFrom
	callID := m.ringingCallID
	m.mu.Unlock()

	c.writeText(mustJSON(status))
	// Replay ringing so a freshly opened LazyCat client WebView can answer.
	if ringing {
		c.writeText(mustJSON(ControlMessage{Type: MsgTypeIncoming, From: from, CallID: callID}))
		c.writeText(mustJSON(ControlMessage{Type: MsgTypeCallState, State: "ringing", CallID: callID, From: from}))
	}
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
		// Never block the WS read loop — otherwise hangup/answer cannot be processed
		// until Invite finishes (can be tens of seconds).
		number := msg.Number
		go func() {
			if err := m.Dial(number); err != nil {
				// Canceled by local hangup is expected — do not surface as error toast.
				if errors.Is(err, context.Canceled) {
					return
				}
				c.writeText(mustJSON(ControlMessage{Type: MsgTypeError, Message: err.Error()}))
			}
		}()
	case MsgTypeAnswer:
		m.signalAnswer()
	case MsgTypeHangup:
		go func() {
			if err := m.Hangup(); err != nil {
				log.Printf("[softphone] hangup: %v", err)
				c.writeText(mustJSON(ControlMessage{Type: MsgTypeError, Message: err.Error()}))
			}
		}()
	case MsgTypeDTMF:
		digit := msg.Digit
		go func() {
			if err := m.SendDTMF(digit); err != nil {
				log.Printf("[softphone] dtmf: %v", err)
				c.writeText(mustJSON(ControlMessage{Type: MsgTypeError, Message: err.Error()}))
			}
		}()
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

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	m.dialCancel = cancel
	m.mu.Unlock()

	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "dialing", CallID: number})

	defer func() {
		m.mu.Lock()
		// Only clear if we still own this cancel (Hangup may have nil'd it already).
		if m.dialCancel != nil {
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
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			// Hangup already broadcast "ended" when it canceled the dial.
			return context.Canceled
		}
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", Reason: err.Error()})
		return err
	}

	// Hangup may have canceled the dial context just as Invite succeeded.
	if ctx.Err() != nil {
		_ = dialog.Hangup(context.Background())
		_ = dialog.Close()
		return context.Canceled
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
	if m.call != nil {
		m.mu.Unlock()
		_ = dialog.Hangup(context.Background())
		_ = dialog.Close()
		callCancel()
		return errors.New("already in a call")
	}
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

	m.mu.Lock()
	canceledDial := false
	if m.dialCancel != nil {
		m.dialCancel()
		m.dialCancel = nil
		canceledDial = true
	}
	call := m.call
	m.call = nil // detach immediately so UI / further hangups see idle
	m.mu.Unlock()

	if call == nil {
		if canceledDial {
			m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", Reason: "local_hangup"})
		}
		return nil
	}

	if call.cancel != nil {
		call.cancel()
	}
	// Close media first so RTP stops; Bye in background with timeout.
	if call.media != nil {
		_ = call.media.Close()
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := call.hangup(ctx); err != nil {
			log.Printf("[softphone] BYE failed: %v", err)
		}
	}()
	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: call.id, Reason: "local_hangup"})
	return nil
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

	m.mu.Lock()
	m.ringing = true
	m.ringingFrom = from
	m.ringingCallID = callID
	m.mu.Unlock()

	m.Broadcast(ControlMessage{Type: MsgTypeIncoming, From: from, CallID: callID})
	m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ringing", CallID: callID, From: from})
	if IncomingCallHook != nil {
		go IncomingCallHook(from)
	}

	timer := time.NewTimer(45 * time.Second)
	defer timer.Stop()

	select {
	case <-m.answerCh:
		// continue
	case <-m.rejectCh:
		m.mu.Lock()
		m.clearRingingLocked()
		m.mu.Unlock()
		_ = inDialog.Respond(sip.StatusBusyHere, "Busy Here", nil)
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: callID, Reason: "rejected"})
		return
	case <-timer.C:
		m.mu.Lock()
		m.clearRingingLocked()
		m.mu.Unlock()
		_ = inDialog.Respond(sip.StatusRequestTimeout, "Request Timeout", nil)
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: callID, Reason: "timeout"})
		return
	case <-inDialog.Context().Done():
		m.mu.Lock()
		m.clearRingingLocked()
		m.mu.Unlock()
		m.Broadcast(ControlMessage{Type: MsgTypeCallState, State: "ended", CallID: callID, Reason: "cancelled"})
		return
	}

	if err := inDialog.Answer(); err != nil {
		m.mu.Lock()
		m.clearRingingLocked()
		m.mu.Unlock()
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
	m.clearRingingLocked()
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
	var dtmfWriter diago.DTMFWriter
	writer, err := call.media.AudioWriter(diago.WithAudioWriterDTMF(&dtmfWriter))
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

	m.mu.Lock()
	m.activeEncoder = enc
	m.activeDTMF = &dtmfWriter
	m.mu.Unlock()

	// Drain stale uplink frames from a previous call.
	for {
		select {
		case <-m.pcmIn:
		default:
			goto drained
		}
	}
drained:
	// diago RTPPacketWriter.Write blocks ~20ms/frame; keep it off the WS read loop.
	go m.pcmUplinkLoop(ctx, enc)

	<-ctx.Done()

	m.mu.Lock()
	m.activeEncoder = nil
	m.activeDTMF = nil
	m.mu.Unlock()
}

func (m *Manager) pcmUplinkLoop(ctx context.Context, enc io.Writer) {
	for {
		select {
		case <-ctx.Done():
			return
		case frame := <-m.pcmIn:
			if enc == nil || len(frame) == 0 {
				continue
			}
			if len(frame) > PCMFrameBytes {
				frame = frame[:PCMFrameBytes]
			} else if len(frame) < PCMFrameBytes {
				padded := make([]byte, PCMFrameBytes)
				copy(padded, frame)
				frame = padded
			}
			if _, err := enc.Write(frame); err != nil && !errors.Is(err, context.Canceled) {
				log.Printf("[softphone] uplink write: %v", err)
				return
			}
		}
	}
}

// PushPCM queues one PCM16LE frame from a browser client (non-blocking).
func (m *Manager) PushPCM(payload []byte) {
	if len(payload) == 0 {
		return
	}
	m.mu.Lock()
	active := m.activeEncoder != nil
	m.mu.Unlock()
	if !active {
		return
	}
	frame := append([]byte(nil), payload...)
	select {
	case m.pcmIn <- frame:
	default:
		select {
		case <-m.pcmIn:
		default:
		}
		select {
		case m.pcmIn <- frame:
		default:
		}
	}
}

// SendDTMF sends one DTMF digit on the active call (RFC2833 + AMI PlayDTMF fallback).
func (m *Manager) SendDTMF(digit string) error {
	if len(digit) != 1 || !isDTMFDigit(digit[0]) {
		return fmt.Errorf("invalid DTMF digit %q", digit)
	}
	m.mu.Lock()
	w := m.activeDTMF
	ext := m.username
	inCall := m.call != nil
	m.mu.Unlock()
	if !inCall {
		return errors.New("not in a call")
	}

	var rtpErr error
	if w != nil {
		rtpErr = w.WriteDTMF(rune(digit[0]))
		if rtpErr != nil {
			log.Printf("[softphone] RTP DTMF %q failed: %v", digit, rtpErr)
		} else {
			log.Printf("[softphone] RTP DTMF sent %q", digit)
		}
	}

	// AMI PlayDTMF is important for Quectel/IVR relay even when RTP path works.
	if ext != "" {
		if err := playDTMFViaAMI(ext, digit); err != nil {
			log.Printf("[softphone] AMI DTMF %q failed: %v", digit, err)
			if rtpErr != nil {
				return fmt.Errorf("dtmf failed: rtp=%v ami=%v", rtpErr, err)
			}
		}
	} else if rtpErr != nil {
		return rtpErr
	}
	return nil
}

func isDTMFDigit(b byte) bool {
	switch b {
	case '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#', 'A', 'B', 'C', 'D', 'a', 'b', 'c', 'd':
		return true
	default:
		return false
	}
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
