[directories]
astetcdir => /etc/asterisk
astmoddir => /usr/lib/asterisk/modules
astvarlibdir => /var/lib/asterisk
astdbdir => /var/lib/asterisk
astkeydir => /var/lib/asterisk
astdatadir => /var/lib/asterisk
astagidir => /var/lib/asterisk/agi-bin
astspooldir => /var/spool/asterisk
astrundir => /var/run/asterisk
astlogdir => /var/log/asterisk
astsbindir => /usr/sbin

[options]
verbose = 3
debug = 0
alwaysfork = yes
nofork = no
quiet = no
timestamp = yes
execincludes = yes
console = yes
highpriority = yes
initcrypto = yes
nocolor = no
dontwarn = no
dumpcore = no
languageprefix = yes
systemname = asterisk
maxcalls = 0
maxload = 0
maxfiles = 8192
minmemfree = 0
cache_record_files = yes
record_cache_dir = /tmp
transcode_via_sln = yes
runuser = asterisk
rungroup = asterisk

[files]
astctlpermissions = 0660
astctlowner = root
astctlgroup = asterisk
astctl = /var/run/asterisk/asterisk.ctl
