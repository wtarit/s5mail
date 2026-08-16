#!/bin/bash
#
# Dovecot 2.4 mail access and local delivery
# --------------------------------------------

source setup/functions.sh
source /etc/s5mail.conf

echo "Installing Dovecot (IMAP server)..."
apt_install \
	dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-sqlite sqlite3 \
	dovecot-sieve dovecot-managesieved

# Keep enough inotify watches for IMAP IDLE clients. A reboot is required for
# a changed sysctl value to take effect, which setup deliberately does not do.
tools/editconf.py /etc/sysctl.conf fs.inotify.max_user_instances=1024

escape_sed_replacement() {
	printf '%s' "$1" | sed 's/[\\&|]/\\\\&/g'
}

render_dovecot_config() {
	local storage_root_escaped primary_hostname_escaped temporary_config
	storage_root_escaped=$(escape_sed_replacement "$STORAGE_ROOT")
	primary_hostname_escaped=$(escape_sed_replacement "$PRIMARY_HOSTNAME")
	temporary_config=$(mktemp /etc/dovecot/dovecot.conf.s5mail.XXXXXX)

	sed \
		-e "s|__STORAGE_ROOT__|$storage_root_escaped|g" \
		-e "s|__PRIMARY_HOSTNAME__|$primary_hostname_escaped|g" \
		conf/dovecot/dovecot.conf > "$temporary_config"

	# Do not replace a working configuration with an invalid generated file.
	if ! doveconf -c "$temporary_config" -n >/dev/null; then
		rm -f "$temporary_config"
		exit 1
	fi

	chown root:dovecot "$temporary_config"
	chmod 0640 "$temporary_config"
	mv -f "$temporary_config" /etc/dovecot/dovecot.conf
}

compile_sieve_scripts() {
	local sieve_script
	while IFS= read -r -d '' sieve_script; do
		sievec -c /etc/dovecot/dovecot.conf "$sieve_script"
	done < <(find \
		/etc/dovecot/sieve/before \
		"$STORAGE_ROOT/mail/sieve/global_before" \
		"$STORAGE_ROOT/mail/sieve/global_after" \
		-type f -name '*.sieve' -print0)
}

# This is a complete, S5-owned Dovecot 2.4 configuration. It intentionally
# does not edit or include Debian's package sample files, whose defaults are
# not a stable S5 Mail interface.
install -d -o root -g dovecot -m 0750 /etc/dovecot/sieve
install -d -o root -g dovecot -m 0750 /etc/dovecot/sieve/before
render_dovecot_config

# Preserve the existing virtual-user Maildir and Sieve layout.
install -d -o mail -g mail -m 0750 "$STORAGE_ROOT/mail/mailboxes"
install -d -o mail -g mail -m 0750 "$STORAGE_ROOT/mail/sieve"
install -d -o mail -g mail -m 0750 "$STORAGE_ROOT/mail/sieve/global_before"
install -d -o mail -g mail -m 0750 "$STORAGE_ROOT/mail/sieve/global_after"
chown -R mail:mail "$STORAGE_ROOT/mail/mailboxes" "$STORAGE_ROOT/mail/sieve"
compile_sieve_scripts

# Expose only the encrypted public mail protocols. The localhost IMAP listener
# for Nextcloud is intentionally not added to the firewall.
ufw_allow imaps
ufw_allow pop3s
ufw_allow sieve

restart_service dovecot
