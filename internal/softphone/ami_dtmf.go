package softphone

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/ety001/lzc-mobile/internal/ami"
	"github.com/staskobzar/goami2"
)

// playDTMFViaAMI finds PJSIP/<ext>-* channels and sends AMI PlayDTMF on each.
// This helps relay digits into Quectel / IVR bridges where RFC2833 alone may not suffice.
func playDTMFViaAMI(extension, digit string) error {
	client := ami.GetManager().GetClient()
	if client == nil {
		return fmt.Errorf("AMI client not available")
	}

	msg, err := client.SendCommand("core show channels concise", 5*time.Second)
	if err != nil {
		return err
	}
	var lines []string
	if vals := msg.FieldValues("Output"); len(vals) > 0 {
		lines = vals
	} else if out := msg.Field("Output"); out != "" {
		lines = strings.Split(out, "\n")
	} else {
		lines = strings.Split(msg.String(), "\n")
	}

	prefix := "PJSIP/" + extension + "-"
	var channels []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// concise: Channel!Context!Exten!...
		ch := line
		if i := strings.IndexByte(line, '!'); i > 0 {
			ch = line[:i]
		}
		if strings.HasPrefix(ch, prefix) {
			channels = append(channels, ch)
		}
	}
	if len(channels) == 0 {
		return fmt.Errorf("no channel matching %s*", prefix)
	}

	var lastErr error
	for _, ch := range channels {
		action := goami2.NewAction("PlayDTMF")
		action.SetField("Channel", ch)
		action.SetField("Digit", digit)
		action.SetField("Duration", "200")
		action.AddActionID()
		if err := client.SendAction(action); err != nil {
			log.Printf("[softphone] PlayDTMF %s on %s: %v", digit, ch, err)
			lastErr = err
			continue
		}
		log.Printf("[softphone] AMI PlayDTMF %s on %s", digit, ch)
	}
	return lastErr
}
