#!/bin/bash
#
# This script will restore the backup made during an installation
source /etc/s5mail.conf # load global vars
PHP_VER=8.4
PHP_FPM_SERVICE="php${PHP_VER}-fpm"

if [ -z "$1" ]; then
	echo "Usage: owncloud-restore.sh <backup directory>"
	echo
	echo "WARNING: This will restore the database to the point of the installation!"
	echo "         This means that you will lose all changes made by users after that point"
	echo
	echo
	echo "Backups are stored here: $STORAGE_ROOT/owncloud-backup/"
	echo
	echo "Available backups:"
	echo
	find "$STORAGE_ROOT/owncloud-backup/"* -maxdepth 0 -type d
	echo
	echo "Supply the directory that was created during the last installation as the only commandline argument"
	exit
fi

if [ ! -f "$1/config.php" ]; then
	echo "This isn't a valid backup location"
	exit 1
fi

echo "Restoring backup from $1"

RESTORE_STOPPED_SERVICES=()
restore_nextcloud_services() {
	local index service
	for ((index=${#RESTORE_STOPPED_SERVICES[@]}-1; index>=0; index--)); do
		service=${RESTORE_STOPPED_SERVICES[$index]}
		systemctl start "$service" >/dev/null 2>&1 || echo "WARNING: Could not restart $service." >&2
	done
}
trap restore_nextcloud_services EXIT

# Establish an exclusive Nextcloud maintenance window before replacing its
# SQLite database. Preserve the prior state of each writer service.
for service in cron "$PHP_FPM_SERVICE"; do
	if systemctl is-active --quiet "$service"; then
		systemctl stop "$service"
		RESTORE_STOPPED_SERVICES+=("$service")
	fi
done
waited=0
while pgrep -f -- '(/usr/local/lib/owncloud/cron\.php|/usr/local/lib/owncloud/occ)' >/dev/null; do
	if [ "$waited" -ge 300 ]; then
		echo "Timed out waiting for Nextcloud jobs to finish; restore was not started." >&2
		exit 1
	fi
	sleep 1
	waited=$((waited + 1))
done

# remove the current ownCloud/Nextcloud installation
rm -rf /usr/local/lib/owncloud/
# restore the current ownCloud/Nextcloud application
cp -r  "$1/owncloud-install" /usr/local/lib/owncloud

# restore access rights
chmod 750 /usr/local/lib/owncloud/{apps,config}

cp "$1/owncloud.db" "$STORAGE_ROOT/owncloud/"
cp "$1/config.php" "$STORAGE_ROOT/owncloud/"
if [ "$(sqlite3 "$STORAGE_ROOT/owncloud/owncloud.db" 'PRAGMA integrity_check;')" != "ok" ]; then
	echo "The restored Nextcloud database failed its integrity check." >&2
	exit 1
fi

ln -sf "$STORAGE_ROOT/owncloud/config.php" /usr/local/lib/owncloud/config/config.php
chown -f -R www-data:www-data "$STORAGE_ROOT/owncloud" /usr/local/lib/owncloud
chown www-data:www-data "$STORAGE_ROOT/owncloud/config.php"

sudo -u www-data "php${PHP_VER}" /usr/local/lib/owncloud/occ maintenance:mode --off

restore_nextcloud_services
RESTORE_STOPPED_SERVICES=()
trap - EXIT
echo "Done"
