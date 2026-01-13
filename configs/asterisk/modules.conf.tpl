[modules]
autoload=yes

; Note: In Asterisk 20, Stasis initialization issues should be resolved
; If you still encounter issues, you can uncomment the following lines to disable stasis modules
;noload => res_stasis.so
;noload => app_stasis.so
;noload => res_stasis_answer.so
;noload => res_stasis_device_state.so
;noload => res_stasis_playback.so
;noload => res_stasis_recording.so
;noload => res_stasis_snoop.so
;noload => res_stasis_test.so
;
; Preload modules
;
;preload => chan_sip.so
;preload => res_musiconhold.so
;
; Modules that should not be loaded
;
;noload => chan_iax2.so
;noload => chan_alsa.so
;
; Modules that should be loaded
;
;load => chan_sip.so
;load => res_musiconhold.so
;
; Global options
;
;require = chan_sip.so
;require = res_musiconhold.so
;
; Module categories
;
; Applications
;load => app_dial.so
;load => app_voicemail.so
;
; Channels
;load => chan_sip.so
;load => chan_iax2.so
;load => chan_dongle.so
;
; Codecs
;load => codec_ulaw.so
;load => codec_alaw.so
;load => codec_gsm.so
;
; Formats
;load => format_wav.so
;load => format_mp3.so
;
; Resources
;load => res_musiconhold.so
;load => res_agi.so
;
; Functions
;load => func_callerid.so
;load => func_strings.so
;
; Asterisk will automatically load modules from /usr/lib/asterisk/modules
; when they are needed. Set autoload=yes to enable this behavior.
