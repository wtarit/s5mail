#!/bin/bash
# This is the entry point for configuring the system.
#####################################################

source setup/functions.sh # load our functions

# An explicit environment setting or command-line option takes precedence over
# the interactive setup prompts.
if [ -n "${ENABLE_SMTP_RELAY+x}" ]; then
	SMTP_RELAY_OPTION_SET=1
else
	SMTP_RELAY_OPTION_SET=0
fi

# Parse command-line options before preflight so `setup/start.sh --help` is
# safe to run on a workstation.
while [ "$#" -gt 0 ]; do
	case "$1" in
		--enable-smtp-relay)
			ENABLE_SMTP_RELAY=1
			SMTP_RELAY_OPTION_SET=1
			;;
		--disable-smtp-relay)
			ENABLE_SMTP_RELAY=0
			SMTP_RELAY_OPTION_SET=1
			;;
		--smtp-relay-host|--smtp-relay-port|--smtp-relay-security|--smtp-relay-username|--smtp-relay-password-file)
			if [ "$#" -lt 2 ] || [ -z "$2" ]; then
				echo "$1 requires a value." >&2
				exit 2
			fi
			case "$1" in
				--smtp-relay-host) SMTP_RELAY_HOST=$2 ;;
				--smtp-relay-port) SMTP_RELAY_PORT=$2 ;;
				--smtp-relay-security) SMTP_RELAY_SECURITY=$2 ;;
				--smtp-relay-username) SMTP_RELAY_USERNAME=$2 ;;
				--smtp-relay-password-file) SMTP_RELAY_PASSWORD_FILE=$2 ;;
			esac
			ENABLE_SMTP_RELAY=1
			SMTP_RELAY_OPTION_SET=1
			shift
			;;
		--help|-h)
			cat <<'EOF'
Usage: sudo setup/start.sh [OPTION]...

Outbound mail delivery:
  --enable-smtp-relay             Send outbound mail through an authenticated SMTP relay.
  --disable-smtp-relay            Deliver outbound mail directly (the default).
  --smtp-relay-host HOST          Relay hostname (implies --enable-smtp-relay).
  --smtp-relay-port PORT          Relay port (default: 587).
  --smtp-relay-security MODE      starttls (default) or implicit-tls.
  --smtp-relay-username USERNAME  Relay authentication username.
  --smtp-relay-password-file FILE Read the relay password from FILE.
EOF
			exit 0
			;;
		*)
			echo "Unknown option: $1" >&2
			echo "Run 'sudo setup/start.sh --help' for usage." >&2
			exit 2
			;;
	esac
	shift
done

# Check system setup: Are we running as root on Debian 13 on a
# machine with enough memory? Is /tmp mounted with exec.
# If not, this shows an error and exits.
source setup/preflight.sh

# Ensure Python reads/writes files in UTF-8. If the machine
# triggers some other locale in Python, like ASCII encoding,
# Python may not be able to read/write files. This is also
# in the management daemon startup script and the cron script.

if ! dpkg-query -W -f='${db:Status-Status}' locales 2>/dev/null | grep -qx installed; then
	LC_ALL=C.UTF-8 hide_output apt-get update
	LC_ALL=C.UTF-8 apt_get_quiet install locales
fi

if ! LC_ALL=C.UTF-8 locale -a | grep -Fxq en_US.utf8; then
	hide_output localedef -i en_US -f UTF-8 \
		-A /usr/share/locale/locale.alias en_US.UTF-8
fi

export LANGUAGE=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
export LC_CTYPE=en_US.UTF-8

# Fix so line drawing characters are shown correctly in Putty on Windows. See #744.
export NCURSES_NO_UTF8_ACS=1

# Provision the uv-managed Python runtime before setup, migration, and
# management code needs to run.
source setup/python.sh

# Create the S5 Mail environment file early in the first v76 upgrade so an
# interrupted setup can be resumed with either the old or new checkout.
if [ ! -f /etc/s5mail.conf ] && [ -f /etc/mailinabox.conf ]; then
	cp -p /etc/mailinabox.conf /etc/s5mail.conf
fi

# Recall the last settings used if we're running this a second time. Read the
# legacy configuration on the first upgrade from the original v76 release.
if [ -f /etc/s5mail.conf ]; then
	PREVIOUS_CONFIG=/etc/s5mail.conf
elif [ -f /etc/mailinabox.conf ]; then
	PREVIOUS_CONFIG=/etc/mailinabox.conf
fi
if [ -n "${PREVIOUS_CONFIG:-}" ]; then
	# Run any system migrations before proceeding. Since this is a second run,
	# we assume we have Python already installed.
	setup/migrate.py --migrate || exit 1

	# Load the old .conf file to get existing configuration options loaded
	# into variables with a DEFAULT_ prefix.
	sed s/^/DEFAULT_/ "$PREVIOUS_CONFIG" > /tmp/s5mail.prev.conf
	source /tmp/s5mail.prev.conf
	rm -f /tmp/s5mail.prev.conf
else
	FIRST_TIME_SETUP=1
fi

ENABLE_SMTP_RELAY="${ENABLE_SMTP_RELAY:-${DEFAULT_ENABLE_SMTP_RELAY:-0}}"
SMTP_RELAY_HOST="${SMTP_RELAY_HOST:-${DEFAULT_SMTP_RELAY_HOST:-}}"
SMTP_RELAY_PORT="${SMTP_RELAY_PORT:-${DEFAULT_SMTP_RELAY_PORT:-587}}"
SMTP_RELAY_SECURITY="${SMTP_RELAY_SECURITY:-${DEFAULT_SMTP_RELAY_SECURITY:-starttls}}"
SMTP_RELAY_USERNAME="${SMTP_RELAY_USERNAME:-${DEFAULT_SMTP_RELAY_USERNAME:-}}"
if [ "$ENABLE_SMTP_RELAY" != "0" ] && [ "$ENABLE_SMTP_RELAY" != "1" ]; then
	echo "ENABLE_SMTP_RELAY must be either 0 or 1." >&2
	exit 2
fi

# Put a start script in a global location. We tell the user to run 's5mail'
# in the first dialog prompt, so we should do this before that starts.
cat > /usr/local/bin/s5mail << EOF;
#!/bin/bash
cd $PWD
source setup/start.sh
EOF
chmod +x /usr/local/bin/s5mail

# Keep the previous command working on upgraded systems.
ln -sf /usr/local/bin/s5mail /usr/local/bin/mailinabox

# Ask the user for the PRIMARY_HOSTNAME, PUBLIC_IP, and PUBLIC_IPV6,
# if values have not already been set in environment variables. When running
# non-interactively, be sure to set values for all! Also sets STORAGE_USER and
# STORAGE_ROOT.
source setup/questions.sh

if [ "$ENABLE_SMTP_RELAY" = "1" ]; then
	if ! SMTP_RELAY_NORMALIZED=$("$S5MAIL_PYTHON" management/smtp_relay.py normalize \
		--host "$SMTP_RELAY_HOST" \
		--port "$SMTP_RELAY_PORT" \
		--security "$SMTP_RELAY_SECURITY" \
		--username "$SMTP_RELAY_USERNAME"); then
		exit 2
	fi
	IFS=$'\t' read -r SMTP_RELAY_HOST SMTP_RELAY_PORT <<< "$SMTP_RELAY_NORMALIZED"
	unset SMTP_RELAY_NORMALIZED

	if [ -n "${SMTP_RELAY_PASSWORD_FILE:-}" ]; then
		if [ ! -r "$SMTP_RELAY_PASSWORD_FILE" ]; then
			echo "Cannot read SMTP relay password file: $SMTP_RELAY_PASSWORD_FILE" >&2
			exit 2
		fi
		SMTP_RELAY_PASSWORD=$(< "$SMTP_RELAY_PASSWORD_FILE")
	fi
	if [[ "${SMTP_RELAY_PASSWORD:-}" == *$'\n'* ]]; then
		echo "The SMTP relay password cannot contain a newline." >&2
		exit 2
	fi
	if [ -z "${SMTP_RELAY_PASSWORD:-}" ] && ! "$S5MAIL_PYTHON" management/smtp_relay.py has-credentials \
		--host "$SMTP_RELAY_HOST" \
		--port "$SMTP_RELAY_PORT" \
		--security "$SMTP_RELAY_SECURITY" \
		--username "$SMTP_RELAY_USERNAME" >/dev/null 2>&1; then
		echo "A non-empty SMTP relay password is required. Use --smtp-relay-password-file for non-interactive setup." >&2
		exit 2
	fi
else
	SMTP_RELAY_HOST=
	SMTP_RELAY_PORT=587
	SMTP_RELAY_SECURITY=starttls
	SMTP_RELAY_USERNAME=
	unset SMTP_RELAY_PASSWORD
fi

# Run some network checks to make sure setup on this machine makes sense.
# Skip on existing installs since we don't want this to block the ability to
# upgrade, and these checks are also in the control panel status checks.
if [ -z "${DEFAULT_PRIMARY_HOSTNAME:-}" ]; then
if [ -z "${SKIP_NETWORK_CHECKS:-}" ]; then
	source setup/network-checks.sh
fi
fi

# Create the STORAGE_USER and STORAGE_ROOT directory if they don't already exist.
#
# Set the directory and all of its parent directories' permissions to world
# readable since it holds files owned by different processes.
#
# If the STORAGE_ROOT is missing the s5mail.version file that lists a
# migration (schema) number for the files stored there, assume this is a fresh
# installation to that directory and write the file to contain the current
# migration number for this version of S5 Mail.
if ! id -u "$STORAGE_USER" >/dev/null 2>&1; then
	useradd -m "$STORAGE_USER"
fi
if [ ! -d "$STORAGE_ROOT" ]; then
	mkdir -p "$STORAGE_ROOT"
fi
f=$STORAGE_ROOT
while [[ $f != / ]]; do chmod a+rx "$f"; f=$(dirname "$f"); done;
if [ ! -f "$STORAGE_ROOT/s5mail.version" ] && [ -f "$STORAGE_ROOT/mailinabox.version" ]; then
	cp -p "$STORAGE_ROOT/mailinabox.version" "$STORAGE_ROOT/s5mail.version"
fi
if [ ! -f "$STORAGE_ROOT/s5mail.version" ]; then
	setup/migrate.py --current > "$STORAGE_ROOT/s5mail.version"
	chown "$STORAGE_USER:$STORAGE_USER" "$STORAGE_ROOT/s5mail.version"
fi

# Save the global options in /etc/s5mail.conf so that standalone
# tools know where to look for data. The default MTA_STS_MODE setting
# is blank unless set by an environment variable, but see web.sh for
# how that is interpreted.
cat > /etc/s5mail.conf << EOF;
STORAGE_USER=$STORAGE_USER
STORAGE_ROOT=$STORAGE_ROOT
PRIMARY_HOSTNAME=$PRIMARY_HOSTNAME
PUBLIC_IP=$PUBLIC_IP
PUBLIC_IPV6=$PUBLIC_IPV6
PRIVATE_IP=$PRIVATE_IP
PRIVATE_IPV6=$PRIVATE_IPV6
MTA_STS_MODE=${DEFAULT_MTA_STS_MODE:-enforce}
ENABLE_SMTP_RELAY=$ENABLE_SMTP_RELAY
SMTP_RELAY_HOST=$SMTP_RELAY_HOST
SMTP_RELAY_PORT=$SMTP_RELAY_PORT
SMTP_RELAY_SECURITY=$SMTP_RELAY_SECURITY
SMTP_RELAY_USERNAME=$SMTP_RELAY_USERNAME
EOF

# Start service configuration.
source setup/system.sh
source setup/ssl.sh
source setup/dns.sh
source setup/mail-postfix.sh
source setup/mail-dovecot.sh
source setup/mail-users.sh
source setup/dkim.sh
source setup/rspamd.sh
source setup/web.sh
source setup/nextcloud.sh
source setup/remove-roundcube.sh
source setup/management.sh
source setup/munin.sh

# Wait for the management daemon to start...
until nc -z -w 4 127.0.0.1 10222
do
	echo "Waiting for the S5 Mail management daemon to start..."
	sleep 2
done

# ...and then have it write the DNS and nginx configuration files and start those
# services.
tools/dns_update
tools/nginx_update

# Give fail2ban another restart. The log files may not all have been present when
# fail2ban was first configured, but they should exist now.
restart_service fail2ban

# If there aren't any mail users yet, create one.
source setup/firstuser.sh

# nginx and PHP-FPM are now serving Nextcloud at its final URL. Configure the
# Mail app's supported provisioning profile so users inherit their authenticated
# IMAP/SMTP/Sieve account without entering the same credentials a second time.
ConfigureNextcloudMailProvisioning

# Register with Let's Encrypt, including agreeing to the Terms of Service.
# We'd let certbot ask the user interactively, but when this script is
# run in the recommended curl-pipe-to-bash method there is no TTY and
# certbot will fail if it tries to ask.
if [ ! -d "$STORAGE_ROOT/ssl/lets_encrypt/accounts/acme-v02.api.letsencrypt.org/" ]; then
echo
echo "-----------------------------------------------"
echo "S5 Mail uses Let's Encrypt to provision free SSL/TLS certificates"
echo "to enable HTTPS connections to your box. We're automatically"
echo "agreeing you to their subscriber agreement. See https://letsencrypt.org."
echo
certbot register --register-unsafely-without-email --agree-tos --config-dir "$STORAGE_ROOT/ssl/lets_encrypt"
fi

# Done.
echo
echo "-----------------------------------------------"
echo
echo "Your S5 Mail is running."
echo
echo "Please log in to the control panel for further instructions at:"
echo
if management/status_checks.py --check-primary-hostname; then
	# Show the nice URL if it appears to be resolving and has a valid certificate.
	echo "https://$PRIMARY_HOSTNAME/admin"
	echo
	echo "If you have a DNS problem put the box's IP address in the URL"
	echo "(https://$PUBLIC_IP/admin) but then check the TLS fingerprint:"
	openssl x509 -in "$STORAGE_ROOT/ssl/ssl_certificate.pem" -noout -fingerprint -sha256\
        	| sed "s/SHA256 Fingerprint=//i"
else
	echo "https://$PUBLIC_IP/admin"
	echo
	echo "You will be alerted that webmail has an invalid certificate. Check that"
	echo "the certificate fingerprint matches:"
	echo
	openssl x509 -in "$STORAGE_ROOT/ssl/ssl_certificate.pem" -noout -fingerprint -sha256\
        	| sed "s/SHA256 Fingerprint=//i"
	echo
	echo "Then you can confirm the security exception and continue."
	echo
fi

# A side-by-side migration removes this marker before its authoritative final
# sync. Recreate it only after the complete Debian provisioning run succeeds,
# allowing the import phase to distinguish preseed setup from reconciled data.
install -d -m 0750 /var/lib/s5mail
printf 'completed=%s\n' "$(date --iso-8601=seconds)" > /var/lib/s5mail/debian13-provisioning-complete
chmod 0600 /var/lib/s5mail/debian13-provisioning-complete
