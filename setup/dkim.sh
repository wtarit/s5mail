#!/bin/bash
# DKIM key material for Rspamd
# ---------------------------
#
# Rspamd signs outbound mail and verifies inbound DKIM.  Keep the existing
# S5 Mail selector and key location so upgrades preserve DNS and mail
# reputation, but do not install a separate OpenDKIM/OpenDMARC daemon.

source setup/functions.sh
source /etc/s5mail.conf

echo "Preparing DKIM key material for Rspamd..."
apt_install openssl

mkdir -p "$STORAGE_ROOT/mail/dkim"
chmod 700 "$STORAGE_ROOT/mail/dkim"

# Existing installations already have this key.  Generate it only for a new
# installation; the private key is intentionally never replaced on reruns.
if [ ! -s "$STORAGE_ROOT/mail/dkim/mail.private" ]; then
	(umask 077; openssl genrsa -traditional -out "$STORAGE_ROOT/mail/dkim/mail.private" 2048)
fi

# Keep the DNS helper's existing mail.txt format.  It is generated only when
# absent so a migrated key and its published record remain untouched.
if [ ! -s "$STORAGE_ROOT/mail/dkim/mail.txt" ]; then
	public_key=$(openssl rsa -in "$STORAGE_ROOT/mail/dkim/mail.private" -pubout -outform DER 2>/dev/null | openssl base64 -A)
	if [ -z "$public_key" ]; then
		echo "Unable to derive the DKIM public key." >&2
		exit 1
	fi
	printf 'mail._domainkey IN TXT ( "v=DKIM1; k=rsa; p=%s" )\n' "$public_key" > "$STORAGE_ROOT/mail/dkim/mail.txt"
fi

chown -R "$STORAGE_USER:$STORAGE_USER" "$STORAGE_ROOT/mail/dkim"
chmod 600 "$STORAGE_ROOT/mail/dkim/mail.private"
chmod 644 "$STORAGE_ROOT/mail/dkim/mail.txt"
