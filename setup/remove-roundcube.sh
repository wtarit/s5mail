#!/bin/bash
# Remove Roundcube after Nextcloud Mail becomes the only webmail client.

source setup/functions.sh
source /etc/s5mail.conf

echo "Removing retired Roundcube webmail components..."

case "$STORAGE_ROOT" in
	""|/)
		echo "Refusing to remove Roundcube state with unsafe STORAGE_ROOT: '$STORAGE_ROOT'." >&2
		exit 1
		;;
esac

ROUNDCUBE_PHP_WAS_ACTIVE=0
restore_roundcube_php() {
	if [ "$ROUNDCUBE_PHP_WAS_ACTIVE" = 1 ]; then
		systemctl start "php${PHP_VER}-fpm"
		ROUNDCUBE_PHP_WAS_ACTIVE=0
	fi
}
if systemctl is-active --quiet "php${PHP_VER}-fpm"; then
	ROUNDCUBE_PHP_WAS_ACTIVE=1
	systemctl stop "php${PHP_VER}-fpm"
fi
trap restore_roundcube_php EXIT

# These are fixed S5-managed paths. The user has explicitly chosen not to
# preserve Roundcube preferences; the source VPS/full backup remains rollback.
rm -rf -- \
	/usr/local/lib/roundcubemail \
	/var/log/roundcubemail \
	/var/tmp/roundcubemail \
	"$STORAGE_ROOT/mail/roundcube"

rm -f -- \
	/etc/logrotate.d/roundcubemail \
	/etc/fail2ban/filter.d/s5mail-roundcube.conf \
	/etc/fail2ban/filter.d/miab-roundcube.conf

restore_roundcube_php
trap - EXIT
