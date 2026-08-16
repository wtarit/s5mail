#!/bin/bash
# Nextcloud
##########################

source setup/functions.sh # load our functions
source /etc/s5mail.conf # load global vars

# ### Installing Nextcloud

echo "Installing Nextcloud (contacts/calendar/mail)..."

# Nextcloud core and app (plugin) versions to install.
# With each version we store a hash to ensure we install what we expect.

# Nextcloud core
# --------------
# * See https://nextcloud.com/changelog for the latest version.
# * Check https://docs.nextcloud.com/server/latest/admin_manual/installation/system_requirements.html
#   for whether it supports the version of PHP available on this machine.
# * This release supports fresh installs and existing Nextcloud 34 databases.
#   Cross-major Nextcloud upgrades must be completed before this setup runs.
# * Release archives are pinned by SHA-256.
nextcloud_ver=34.0.2
nextcloud_hash=ffc9e8c3c61c22585d394927cb188bf2f5306fb0119f2fa54739c65fb14c0eb1

# Nextcloud apps
# --------------
# * Find the most recent release that is compatible with the Nextcloud version above by:
#   https://apps.nextcloud.com/apps/contacts
#   https://apps.nextcloud.com/apps/calendar
#   https://apps.nextcloud.com/apps/mail
#   https://apps.nextcloud.com/apps/user_external
#
# * App release archives are pinned by SHA-256.

# Always ensure the versions are supported, see https://apps.nextcloud.com/apps/contacts
contacts_ver=8.7.5
contacts_hash=9935218201ce3f8d06b3be31a0b6df9fbba23f6993724ff3799686dd873c3ea9

# Always ensure the versions are supported, see https://apps.nextcloud.com/apps/calendar
calendar_ver=6.5.2
calendar_hash=86c7d9c5d0455b3e23154e44b12c92458663577285e59778a03825c8436ab143

# Always ensure the versions are supported, see https://apps.nextcloud.com/apps/mail
mail_ver=5.10.9
mail_hash=5d996e7eba1408fef399ab4a8bafe59da27cf252c8665c50262fdb09e64b1ccf

# Always ensure the versions are supported, see https://apps.nextcloud.com/apps/user_external
user_external_ver=4.0.0
user_external_hash=f1f98c577bd02177fe74e9199f8e50d0c288ffa94bb50a227101a5ba0633c529

# Developer advice (test plan)
# ----------------------------
# When upgrading above versions, how to test?
#
# 1. Enter your server instance (or on the Vagrant image)
# 1. Git clone <your fork>
# 2. Git checkout <your fork>
# 3. Run `sudo ./setup/nextcloud.sh`
# 4. Ensure the installation completes. If any hashes mismatch, correct them.
# 5. Enter nextcloud web, run following tests:
# 5.1 You still can create, edit and delete contacts
# 5.2 You still can create, edit and delete calendar events
# 5.3 You still can create, edit and delete users
# 5.4 Open Mail, verify the provisioned account appears, and test receiving and sending mail
# 5.5 Go to Administration > Logs and ensure no new errors are shown

# Clear prior packages and install dependencies from apt.
apt-get purge -qq -y owncloud* # we used to use the package manager

apt_install curl php"${PHP_VER}" php"${PHP_VER}"-fpm \
	php"${PHP_VER}"-cli php"${PHP_VER}"-sqlite3 php"${PHP_VER}"-gd php"${PHP_VER}"-curl \
	php"${PHP_VER}"-dev php"${PHP_VER}"-gd php"${PHP_VER}"-xml php"${PHP_VER}"-mbstring php"${PHP_VER}"-zip php"${PHP_VER}"-apcu \
	php"${PHP_VER}"-intl php"${PHP_VER}"-imagick php"${PHP_VER}"-gmp php"${PHP_VER}"-bcmath

# Enable APC before Nextcloud tools are run.
tools/editconf.py /etc/php/"$PHP_VER"/mods-available/apcu.ini -c ';' \
	apc.enabled=1 \
	apc.enable_cli=1

NEXTCLOUD_CRON_WAS_ACTIVE=0
NEXTCLOUD_QUIESCE_TRAP_ACTIVE=0
NEXTCLOUD_UPGRADE_MARKER="$STORAGE_ROOT/owncloud-upgrade-in-progress"

resume_nextcloud_cron_service() {
	if [ "${NEXTCLOUD_CRON_WAS_ACTIVE:-0}" != 1 ]; then
		return
	fi

	if ! service cron start > /dev/null 2>&1; then
		echo "WARNING: The cron service could not be restarted. Restart it manually with: service cron start" >&2
	fi
	NEXTCLOUD_CRON_WAS_ACTIVE=0
}

quiesce_nextcloud() {
	# The cron definitions from both Mail-in-a-Box v76 and S5 Mail can launch
	# Nextcloud CLI writers while PHP-FPM is stopped. Stop cron before removing
	# the generated definitions so there is no race with cron reading them.
	if service cron status > /dev/null 2>&1; then
		NEXTCLOUD_CRON_WAS_ACTIVE=1
		hide_output service cron stop
		if service cron status > /dev/null 2>&1; then
			echo "Cron is still running. Refusing to upgrade Nextcloud." >&2
			return 1
		fi
	fi
	# A legacy cron definition on an otherwise current database can mean a v76
	# upgrade stopped after Nextcloud recorded its new version but before the
	# remaining database maintenance completed.
	if [ -e /etc/cron.d/mailinabox-nextcloud ] && [ -e "$STORAGE_ROOT/owncloud/owncloud.db" ]; then
		touch "$NEXTCLOUD_UPGRADE_MARKER"
	fi
	rm -f /etc/cron.d/mailinabox-nextcloud \
		/etc/cron.d/s5mail-nextcloud \
		/etc/cron.d/.s5mail-nextcloud.new

	# Stop web requests and verify the service is actually inactive. A failed
	# stop must not be ignored before copying or migrating the SQLite database.
	service php"$PHP_VER"-fpm stop > /dev/null 2>&1 || /bin/true
	if service php"$PHP_VER"-fpm status > /dev/null 2>&1; then
		echo "PHP-FPM is still running. Refusing to upgrade Nextcloud." >&2
		return 1
	fi

	# Stopping cron does not terminate a job it already launched. Wait for any
	# existing Nextcloud CLI writer to finish before backing up the database.
	local process_pattern="php([0-9.]+)?([[:space:]]|$).*(/usr/local/lib/owncloud/cron\\.php|/usr/local/lib/owncloud/occ)"
	local waited=0
	while pgrep -f -- "$process_pattern" > /dev/null; do
		if [ "$waited" -ge 300 ]; then
			echo "Timed out waiting for these Nextcloud jobs to finish:" >&2
			pgrep -af -- "$process_pattern" >&2 || /bin/true
			return 1
		fi
		sleep 1
		waited=$((waited + 1))
	done
}

NEXTCLOUD_DATABASE_MAINTENANCE_COMPLETED=0
NEXTCLOUD_MAIL_CODE_CHANGED=0

CompleteNextcloudDatabaseMaintenance() {
	# These migrations are not included in the normal upgrade because they can
	# take time. They must complete before advancing to the next major version.
	sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ db:add-missing-indices
	sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ db:add-missing-primary-keys
	sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ db:convert-filecache-bigint --no-interaction

	# Complete queued background migrations before moving to the next major
	# version, as required by Nextcloud's upgrade procedure.
	for _ in 1 2 3; do
		sudo -u www-data php"$PHP_VER" -f /usr/local/lib/owncloud/cron.php
	done

	NEXTCLOUD_DATABASE_MAINTENANCE_COMPLETED=1
}

InstallNextcloud() {

	version=$1
	hash=$2
	version_contacts=$3
	hash_contacts=$4
	version_calendar=$5
	hash_calendar=$6
	version_user_external=${7:-}
	hash_user_external=${8:-}

	echo
	echo "Upgrading to Nextcloud version $version"
	echo

	# Download and verify
	wget_verify "https://download.nextcloud.com/server/releases/nextcloud-$version.zip" "$hash" /tmp/nextcloud.zip

	# Remove the current owncloud/Nextcloud
	rm -rf /usr/local/lib/owncloud

	# Extract ownCloud/Nextcloud
	unzip -q /tmp/nextcloud.zip -d /usr/local/lib
	mv /usr/local/lib/nextcloud /usr/local/lib/owncloud
	rm -f /tmp/nextcloud.zip

	# The apps we actually want are not in Nextcloud core. Download their
	# packaged releases from GitHub.
	mkdir -p /usr/local/lib/owncloud/apps

	wget_verify "https://github.com/nextcloud-releases/contacts/releases/download/v$version_contacts/contacts-v$version_contacts.tar.gz" "$hash_contacts" /tmp/contacts.tgz
	tar xf /tmp/contacts.tgz -C /usr/local/lib/owncloud/apps/
	rm /tmp/contacts.tgz

	wget_verify "https://github.com/nextcloud-releases/calendar/releases/download/v$version_calendar/calendar-v$version_calendar.tar.gz" "$hash_calendar" /tmp/calendar.tgz
	tar xf /tmp/calendar.tgz -C /usr/local/lib/owncloud/apps/
	rm /tmp/calendar.tgz

	# Starting with Nextcloud 15, the app user_external is no longer included in Nextcloud core,
	# we will install from their github repository.
	if [ -n "$version_user_external" ]; then
		wget_verify "https://github.com/nextcloud-releases/user_external/releases/download/v$version_user_external/user_external-v$version_user_external.tar.gz" "$hash_user_external" /tmp/user_external.tgz
		tar -xf /tmp/user_external.tgz -C /usr/local/lib/owncloud/apps/
		rm /tmp/user_external.tgz
	fi

	# Fix weird permissions.
	chmod 750 /usr/local/lib/owncloud/{apps,config}

	# Create a symlink to the config.php in STORAGE_ROOT (for upgrades we're restoring the symlink we previously
	# put in, and in new installs we're creating a symlink and will create the actual config later).
	ln -sf "$STORAGE_ROOT/owncloud/config.php" /usr/local/lib/owncloud/config/config.php

	# Make sure permissions are correct or the upgrade step won't run.
	# $STORAGE_ROOT/owncloud may not yet exist, so use -f to suppress
	# that error.
	chown -f -R www-data:www-data "$STORAGE_ROOT/owncloud" /usr/local/lib/owncloud || /bin/true

	# If this isn't a new installation, immediately run the upgrade script.
	# Then check for success (0=ok and 3=no upgrade needed, both are success).
	if [ -e "$STORAGE_ROOT/owncloud/owncloud.db" ]; then
		# ownCloud 8.1.1 broke upgrades. It may fail on the first attempt, but
		# that can be OK.
		sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ upgrade
		E=$?
		if [ $E -ne 0 ] && [ $E -ne 3 ]; then
			echo "Trying ownCloud upgrade again to work around ownCloud upgrade bug..."
			sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ upgrade
			E=$?
			if [ $E -ne 0 ] && [ $E -ne 3 ]; then exit 1; fi
			sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ maintenance:mode --off
			echo "...which seemed to work."
		fi

		CompleteNextcloudDatabaseMaintenance
	fi
}

InstallNextcloudMail() {
	local version=$1
	local hash=$2
	local app_dir=/usr/local/lib/owncloud/apps/mail
	local installed_version=""

	if [ -f "$app_dir/appinfo/info.xml" ]; then
		installed_version=$(sed -n 's|.*<version>\([^<]*\)</version>.*|\1|p' "$app_dir/appinfo/info.xml" | head -n 1)
	fi
	if [ "$installed_version" = "$version" ]; then
		return
	fi

	# Download and verify the complete release before replacing existing app
	# code. Mail's account state remains in the Nextcloud database.
	wget_verify "https://github.com/nextcloud-releases/mail/releases/download/v$version/mail-v$version.tar.gz" "$hash" /tmp/mail.tgz
	local staging_dir
	staging_dir=$(mktemp -d /usr/local/lib/owncloud/apps/.mail.XXXXXX)
	tar xf /tmp/mail.tgz -C "$staging_dir"
	if [ ! -f "$staging_dir/mail/appinfo/info.xml" ]; then
		echo "The Nextcloud Mail release does not contain the expected app files." >&2
		return 1
	fi

	rm -rf "$app_dir"
	mv "$staging_dir/mail" "$app_dir"
	rmdir "$staging_dir"
	rm -f /tmp/mail.tgz
	chown -R www-data:www-data "$app_dir"
	NEXTCLOUD_MAIL_CODE_CHANGED=1
}

# Current Nextcloud Version, #1623
# Checking /usr/local/lib/owncloud/version.php shows version of the Nextcloud application, not the DB
# $STORAGE_ROOT/owncloud is kept together even during a backup. It is better to rely on config.php than
# version.php since the restore procedure can leave the system in a state where you have a newer Nextcloud
# application version than the database.

# If config.php exists, get version number, otherwise CURRENT_NEXTCLOUD_VER is empty.
if [ -f "$STORAGE_ROOT/owncloud/config.php" ]; then
	CURRENT_NEXTCLOUD_VER=$(php"$PHP_VER" -r "include(\"$STORAGE_ROOT/owncloud/config.php\"); echo(\$CONFIG['version']);")
else
	CURRENT_NEXTCLOUD_VER=""
fi

if [ -n "$CURRENT_NEXTCLOUD_VER" ] && [[ ! $CURRENT_NEXTCLOUD_VER =~ ^34\. ]]; then
	echo "Debian 13 migration requires Nextcloud 34; found $CURRENT_NEXTCLOUD_VER." >&2
	exit 1
fi
if [ -e "$STORAGE_ROOT/owncloud/owncloud.db" ] && [ -z "$CURRENT_NEXTCLOUD_VER" ]; then
	echo "Cannot determine the version of the existing Nextcloud database; refusing to replace its application code." >&2
	exit 1
fi

# Every run below executes Nextcloud CLI commands, including when a previous
# attempt updated the recorded version before a later migration failed. Keep
# all web and scheduled writers out until configuration is complete.
trap resume_nextcloud_cron_service EXIT
NEXTCLOUD_QUIESCE_TRAP_ACTIVE=1
quiesce_nextcloud

# If the Nextcloud directory is missing (never been installed before, or the nextcloud version to be installed is different
# from the version currently installed, do the install/upgrade
if [ ! -d /usr/local/lib/owncloud/ ] || [[ ! ${CURRENT_NEXTCLOUD_VER} =~ ^$nextcloud_ver ]]; then
	if [ -e "$STORAGE_ROOT/owncloud/owncloud.db" ]; then
		touch "$NEXTCLOUD_UPGRADE_MARKER"
	fi

	# Backup the existing ownCloud/Nextcloud.
	# Create a backup directory to store the current installation and database to
	BACKUP_DIRECTORY=$STORAGE_ROOT/owncloud-backup/$(date +"%Y-%m-%d-%T")
	mkdir -p "$BACKUP_DIRECTORY"
	if [ -d /usr/local/lib/owncloud/ ]; then
		echo "Upgrading Nextcloud --- backing up existing installation, configuration, and database to directory to $BACKUP_DIRECTORY..."
		cp -r /usr/local/lib/owncloud "$BACKUP_DIRECTORY/owncloud-install"
	fi
	if [ -e "$STORAGE_ROOT/owncloud/owncloud.db" ]; then
		cp "$STORAGE_ROOT/owncloud/owncloud.db" "$BACKUP_DIRECTORY"
	fi
	if [ -e "$STORAGE_ROOT/owncloud/config.php" ]; then
		cp "$STORAGE_ROOT/owncloud/config.php" "$BACKUP_DIRECTORY"
	fi

	if [ -n "${CURRENT_NEXTCLOUD_VER}" ] && [ -e "$STORAGE_ROOT/owncloud/config.php" ]; then
		# Let Nextcloud update the configuration while its writers are quiesced.
		sed -i -e '/config_is_read_only/d' "$STORAGE_ROOT/owncloud/config.php"
	fi

	InstallNextcloud "$nextcloud_ver" "$nextcloud_hash" "$contacts_ver" "$contacts_hash" "$calendar_ver" "$calendar_hash" "$user_external_ver" "$user_external_hash"
fi

# Install or update Mail even when the Nextcloud 34 core code is already current.
InstallNextcloudMail "$mail_ver" "$mail_hash"

# Enabling Mail for the first time or updating its code may run app database
# migrations below. On an already-current Nextcloud installation there is no
# core-upgrade backup, so make one here while web and cron writers are stopped.
if [ -e "$STORAGE_ROOT/owncloud/owncloud.db" ]; then
	mail_enabled=$(sqlite3 "$STORAGE_ROOT/owncloud/owncloud.db" \
		"SELECT 1 FROM oc_appconfig WHERE appid='mail' AND configkey='enabled' AND configvalue <> 'no' LIMIT 1;" \
		|| /bin/true)
	if [ "$NEXTCLOUD_MAIL_CODE_CHANGED" = 1 ] || [ -z "$mail_enabled" ]; then
		MAIL_BACKUP_DIRECTORY=$STORAGE_ROOT/owncloud-backup/$(date +"%Y-%m-%d-%T")-before-mail-$mail_ver
		mkdir -p "$MAIL_BACKUP_DIRECTORY"
		cp "$STORAGE_ROOT/owncloud/owncloud.db" "$MAIL_BACKUP_DIRECTORY"
		if [ -e "$STORAGE_ROOT/owncloud/config.php" ]; then
			cp "$STORAGE_ROOT/owncloud/config.php" "$MAIL_BACKUP_DIRECTORY"
		fi
	fi
fi

# The version in config.php may already be current after an interrupted run.
# The marker keeps the remaining database work from being skipped on retry.
if [ -e "$NEXTCLOUD_UPGRADE_MARKER" ]; then
	if [ "$NEXTCLOUD_DATABASE_MAINTENANCE_COMPLETED" != 1 ]; then
		CompleteNextcloudDatabaseMaintenance
	fi
	sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ maintenance:repair --include-expensive
	rm -f "$NEXTCLOUD_UPGRADE_MARKER"
fi

# ### Configuring Nextcloud

# Setup Nextcloud if the Nextcloud database does not yet exist. Running setup when
# the database does exist wipes the database and user data.
if [ ! -f "$STORAGE_ROOT/owncloud/owncloud.db" ]; then
	# Create user data directory
	mkdir -p "$STORAGE_ROOT/owncloud"

	# Create an initial configuration file.
	instanceid=oc$(echo "$PRIMARY_HOSTNAME" | sha1sum | fold -w 10 | head -n 1)
	cat > "$STORAGE_ROOT/owncloud/config.php" <<EOF;
<?php
\$CONFIG = array (
  'datadirectory' => '$STORAGE_ROOT/owncloud',

  'instanceid' => '$instanceid',

  'forcessl' => true, # if unset/false, Nextcloud sends a HSTS=0 header, which conflicts with nginx config

  'overwrite.cli.url' => 'https://$PRIMARY_HOSTNAME',
  'user_backends' => array(
    array(
      'class' => '\OCA\UserExternal\IMAP',
      'arguments' => array(
        '127.0.0.1', 143, null, null, false, false
       ),
    ),
  ),
  'memcache.local' => '\OC\Memcache\APCu',
);
?>
EOF

	# Create an auto-configuration file to fill in database settings
	# when the install script is run. Make an administrator account
	# here or else the install can't finish.
	adminpassword=$(dd if=/dev/urandom bs=1 count=40 2>/dev/null | sha1sum | fold -w 30 | head -n 1)
	cat > /usr/local/lib/owncloud/config/autoconfig.php <<EOF;
<?php
\$AUTOCONFIG = array (
  # storage/database
  'directory' => '$STORAGE_ROOT/owncloud',
  'dbtype' => 'sqlite3',

  # create an administrator account with a random password so that
  # the user does not have to enter anything on first load of Nextcloud
  'adminlogin'    => 'root',
  'adminpass'     => '$adminpassword',
);
?>
EOF

	# Set permissions
	chown -R www-data:www-data "$STORAGE_ROOT/owncloud" /usr/local/lib/owncloud

	# Execute Nextcloud's setup step, which creates the Nextcloud sqlite database.
	# It also wipes it if it exists. And it updates config.php with database
	# settings and deletes the autoconfig.php file.
	(cd /usr/local/lib/owncloud || exit; sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/index.php;)
fi

# Update config.php.
# * trusted_domains is reset to localhost by autoconfig starting with ownCloud 8.1.1,
#   so set it here. It also can change if the box's PRIMARY_HOSTNAME changes, so
#   this will make sure it has the right value.
# * Some settings weren't included in previous versions of S5 Mail.
# * We need to set the timezone to the system timezone to allow fail2ban to ban
#   users within the proper timeframe
# * We need to set the logdateformat to something that will work correctly with fail2ban
# * mail_domain' needs to be set every time we run the setup. Making sure we are setting
#   the correct domain name if the domain is being change from the previous setup.
# Use PHP to read the settings file, modify it, and write out the new settings array.
TIMEZONE=$(cat /etc/timezone)
CONFIG_TEMP=$(/bin/mktemp)
php"$PHP_VER" <<EOF > "$CONFIG_TEMP" && mv "$CONFIG_TEMP" "$STORAGE_ROOT/owncloud/config.php";
<?php
include("$STORAGE_ROOT/owncloud/config.php");

\$CONFIG['config_is_read_only'] = false;

\$CONFIG['trusted_domains'] = array('$PRIMARY_HOSTNAME');

\$CONFIG['memcache.local'] = '\OC\Memcache\APCu';
unset(\$CONFIG['overwritewebroot']);
\$CONFIG['overwrite.cli.url'] = 'https://${PRIMARY_HOSTNAME}';
\$CONFIG['lost_password_link'] = 'https://${PRIMARY_HOSTNAME}/admin/#account-password';

\$CONFIG['logtimezone'] = '$TIMEZONE';
\$CONFIG['logdateformat'] = 'Y-m-d H:i:s';

\$CONFIG['user_backends'] = array(
  array(
    'class' => '\OCA\UserExternal\IMAP',
    'arguments' => array(
      '127.0.0.1', 143, null, null, false, false
    ),
  ),
);

\$CONFIG['mail_domain'] = '$PRIMARY_HOSTNAME';
\$CONFIG['mail_from_address'] = 'administrator'; # just the local part, matches the required administrator alias on mail_domain/$PRIMARY_HOSTNAME
\$CONFIG['mail_smtpmode'] = 'sendmail';
\$CONFIG['mail_smtpauth'] = true; # if smtpmode is smtp
\$CONFIG['mail_smtphost'] = '127.0.0.1'; # if smtpmode is smtp
\$CONFIG['mail_smtpport'] = '587'; # if smtpmode is smtp
\$CONFIG['mail_smtpsecure'] = ''; # if smtpmode is smtp, must be empty string
\$CONFIG['mail_smtpname'] = ''; # if smtpmode is smtp, set this to a mail user
\$CONFIG['mail_smtppassword'] = ''; # if smtpmode is smtp, set this to the user's password

echo "<?php\n\\\$CONFIG = ";
var_export(\$CONFIG);
echo ";";
?>
EOF
chown www-data:www-data "$STORAGE_ROOT/owncloud/config.php"

# Enable the appliance integrations after Nextcloud setup. Leave Nextcloud's
# bundled apps and defaults alone; user_external supplies IMAP-backed login,
# while contacts, calendar, and mail provide the selected groupware features.
hide_output sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ app:enable user_external
hide_output sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ app:enable contacts
hide_output sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ app:enable calendar
hide_output sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ app:enable mail

# When upgrading, run the upgrade script again now that apps are enabled. It seems like
# the first upgrade at the top won't work because apps may be disabled during upgrade?
# Check for success (0=ok, 3=no upgrade needed).
sudo -u www-data php"$PHP_VER" /usr/local/lib/owncloud/occ upgrade
E=$?
if [ $E -ne 0 ] && [ $E -ne 3 ]; then exit 1; fi

# Set PHP FPM values to support large file uploads
# (semicolon is the comment character in this file, hashes produce deprecation warnings)
tools/editconf.py /etc/php/"$PHP_VER"/fpm/php.ini -c ';' \
	upload_max_filesize=16G \
	post_max_size=16G \
	output_buffering=16384 \
	memory_limit=512M \
	max_execution_time=600 \
	short_open_tag=On

# Set Nextcloud recommended opcache settings
tools/editconf.py /etc/php/"$PHP_VER"/cli/conf.d/10-opcache.ini -c ';' \
	opcache.enable=1 \
	opcache.enable_cli=1 \
	opcache.interned_strings_buffer=8 \
	opcache.max_accelerated_files=10000 \
	opcache.memory_consumption=128 \
	opcache.save_comments=1 \
	opcache.revalidate_freq=1

# We also need to change the sending mode from background-job to occ.
# Or else the reminders will just be sent as soon as possible when the background jobs run.
hide_output sudo -u www-data php"$PHP_VER" -f /usr/local/lib/owncloud/occ config:app:set dav sendEventRemindersMode --value occ

# Rotate the nextcloud.log file
cat > /etc/logrotate.d/nextcloud <<EOF
# Nextcloud logs
$STORAGE_ROOT/owncloud/nextcloud.log {
		size 10M
		create 640 www-data www-data
		rotate 30
		copytruncate
		missingok
		compress
}
EOF

# Nextcloud administration remains a separate privilege boundary. A local
# break-glass administrator is created above; use tools/owncloud-unlockadmin.sh
# to promote a chosen account through Nextcloud's supported occ interface.

# Enable PHP modules and restart PHP.
restart_service php"$PHP_VER"-fpm

# Restore Nextcloud's scheduled jobs only after every database operation and
# the PHP restart have completed successfully. Write outside cron's filename
# rules first so a failed write cannot leave an active partial definition.
cat > /etc/cron.d/.s5mail-nextcloud.new << EOF;
#!/bin/bash
# S5 Mail
*/5 * * * *	www-data	php$PHP_VER -f /usr/local/lib/owncloud/cron.php
*/5 * * * *	www-data	php$PHP_VER -f /usr/local/lib/owncloud/occ dav:send-event-reminders
EOF
chmod +x /etc/cron.d/.s5mail-nextcloud.new
mv /etc/cron.d/.s5mail-nextcloud.new /etc/cron.d/s5mail-nextcloud

echo "Nextcloud Mail is installed at https://$PRIMARY_HOSTNAME/apps/mail/."
echo "In Nextcloud Settings > Administration > Mail, create one provisioning profile using:"
echo "  IMAP $PRIMARY_HOSTNAME:993 SSL, SMTP $PRIMARY_HOSTNAME:587 STARTTLS, Sieve $PRIMARY_HOSTNAME:4190 STARTTLS"
echo "  Email %EMAIL%, username %USERID%, and no master password."

# Restore cron only if this script stopped it. On successful upgrades the S5
# Mail Nextcloud cron definition above has replaced either generated legacy
# definition that was removed before the database migration.
if [ "$NEXTCLOUD_QUIESCE_TRAP_ACTIVE" = 1 ]; then
	resume_nextcloud_cron_service
	trap - EXIT
fi
