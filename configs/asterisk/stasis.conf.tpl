; Stasis configuration file
; Minimal configuration to avoid initialization issues

[threadpool]
initial_size = 5
idle_timeout_sec = 20
max_size = 50

; Do not include [declined_message_types] section
; The error "Cannot update type 'declined_message_types'" occurs when
; this section exists but is empty or has no valid entries
