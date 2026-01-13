; Stasis configuration file
; Asterisk 20.17.0 uses taskpool instead of threadpool

[taskpool]
initial_size = 5
minimum_size = 5
max_size = 50
idle_timeout_sec = 20

; Do not include [declined_message_types] section
; The error "Cannot update type 'declined_message_types'" occurs when
; this section exists but is empty or has no valid entries
; Leaving it out entirely avoids the documentation error
