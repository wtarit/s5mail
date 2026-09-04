#!/bin/bash
# HTTP: Configure the web server and PHP runtime
#################################################

source setup/functions.sh # load our functions
source /etc/s5mail.conf # load global vars

# Some cloud images start off with Apache. Remove it since we
# will use nginx. Use autoremove to remove any Apache dependencies.
if [ -f /usr/sbin/apache2 ]; then
	echo "Removing apache..."
	hide_output apt-get -y purge apache2 apache2-*
	hide_output apt-get -y --purge autoremove
fi

# Install nginx and a PHP FastCGI daemon.
#
# Turn off nginx's default website.

echo "Installing Nginx (web server)..."

apt_install nginx php"${PHP_VER}"-cli php"${PHP_VER}"-fpm idn2

rm -f /etc/nginx/sites-enabled/default

# Ensure Nextcloud's .mjs assets are served as JavaScript on minimal images.
sed -i 's#application/javascript[[:space:]]*js;#application/javascript js mjs;#' /etc/nginx/mime.types

# Copy in a nginx configuration file for common and best-practices
# SSL settings from @konklone. Replace STORAGE_ROOT so it can find
# the DH params.
rm -f /etc/nginx/nginx-ssl.conf # we used to put it here
sed "s#STORAGE_ROOT#$STORAGE_ROOT#" \
	conf/nginx-ssl.conf > /etc/nginx/conf.d/ssl.conf

# Fix some nginx defaults.
#
# The server_names_hash_bucket_size seems to prevent long domain names!
# The default, according to nginx's docs, depends on "the size of the
# processor’s cache line." It could be as low as 32. We fixed it at
# 64 in 2014 to accommodate a long domain name (20 characters?). But
# even at 64, a 58-character domain name won't work (#93), so now
# we're going up to 128.
#
# Drop TLSv1.0, TLSv1.1, following the Mozilla "Intermediate" recommendations
# at https://ssl-config.mozilla.org/#server=nginx&server-version=1.17.0&config=intermediate&openssl-version=1.1.1.
tools/editconf.py /etc/nginx/nginx.conf -s \
	server_names_hash_bucket_size="128;" \
	ssl_protocols="TLSv1.2 TLSv1.3;"

# Tell PHP not to expose its version number in the X-Powered-By header.
tools/editconf.py /etc/php/"$PHP_VER"/fpm/php.ini -c ';' \
	expose_php=Off

# Set PHPs default charset to UTF-8, since we use it. See #367.
tools/editconf.py /etc/php/"$PHP_VER"/fpm/php.ini -c ';' \
        default_charset="UTF-8"

# Configure the path environment for php-fpm
tools/editconf.py /etc/php/"$PHP_VER"/fpm/pool.d/www.conf -c ';' \
	env[PATH]=/usr/local/bin:/usr/bin:/bin \

# Configure php-fpm based on the amount of memory the machine has
# This is based on the nextcloud manual for performance tuning: https://docs.nextcloud.com/server/17/admin_manual/installation/server_tuning.html
# Some synchronisation issues can occur when many people access the site at once.
# The pm=ondemand setting is used for memory constrained machines < 2GB, this is copied over from PR: 1216
TOTAL_PHYSICAL_MEM=$(head -n 1 /proc/meminfo | awk '{print $2}' || /bin/true)
if [ "$TOTAL_PHYSICAL_MEM" -lt 1500000 ]
then
        tools/editconf.py /etc/php/"$PHP_VER"/fpm/pool.d/www.conf -c ';' \
                pm=ondemand \
                pm.max_children=2 \
                pm.process_idle_timeout=10s
elif [ "$TOTAL_PHYSICAL_MEM" -lt 2500000 ]
then
        tools/editconf.py /etc/php/"$PHP_VER"/fpm/pool.d/www.conf -c ';' \
                pm=ondemand \
                pm.max_children=4 \
                pm.process_idle_timeout=10s
elif [ "$TOTAL_PHYSICAL_MEM" -lt 4000000 ]
then
        tools/editconf.py /etc/php/"$PHP_VER"/fpm/pool.d/www.conf -c ';' \
                pm=dynamic \
                pm.max_children=12 \
                pm.start_servers=2 \
                pm.min_spare_servers=1 \
                pm.max_spare_servers=4
else
        tools/editconf.py /etc/php/"$PHP_VER"/fpm/pool.d/www.conf -c ';' \
                pm=dynamic \
                pm.max_children=24 \
                pm.start_servers=4 \
                pm.min_spare_servers=2 \
                pm.max_spare_servers=8
fi

# Other nginx settings will be configured by the management service
# since it depends on what domains we're serving, which we don't know
# until mail accounts have been created.

# Create the iOS/OS X Mobile Configuration file which is exposed via the
# nginx configuration at /s5mail.mobileconfig.
mkdir -p /var/lib/s5mail
chmod a+rx /var/lib/s5mail
cat conf/ios-profile.xml \
	| sed "s/PRIMARY_HOSTNAME/$PRIMARY_HOSTNAME/" \
	| sed "s/UUID1/$(cat /proc/sys/kernel/random/uuid)/" \
	| sed "s/UUID2/$(cat /proc/sys/kernel/random/uuid)/" \
	| sed "s/UUID3/$(cat /proc/sys/kernel/random/uuid)/" \
	| sed "s/UUID4/$(cat /proc/sys/kernel/random/uuid)/" \
	 > /var/lib/s5mail/mobileconfig.xml
chmod a+r /var/lib/s5mail/mobileconfig.xml

# Create the Mozilla Auto-configuration file which is exposed via the
# nginx configuration at /.well-known/autoconfig/mail/config-v1.1.xml.
# The format of the file is documented at:
# https://wiki.mozilla.org/Thunderbird:Autoconfiguration:ConfigFileFormat
# and https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Autoconfiguration/FileFormat/HowTo.
cat conf/mozilla-autoconfig.xml \
	| sed "s/PRIMARY_HOSTNAME/$PRIMARY_HOSTNAME/" \
	 > /var/lib/s5mail/mozilla-autoconfig.xml
chmod a+r /var/lib/s5mail/mozilla-autoconfig.xml

# Create a generic mta-sts.txt file which is exposed via the
# nginx configuration at /.well-known/mta-sts.txt
# more documentation is available on:
# https://www.uriports.com/blog/mta-sts-explained/
# default mode is "enforce". In /etc/s5mail.conf change
# "MTA_STS_MODE=testing" which means "Messages will be delivered
# as though there was no failure but a report will be sent if
# TLS-RPT is configured" if you are not sure you want this yet. Or "none".
PUNY_PRIMARY_HOSTNAME=$(echo "$PRIMARY_HOSTNAME" | idn2)
cat conf/mta-sts.txt \
        | sed "s/MODE/${MTA_STS_MODE}/" \
        | sed "s/PRIMARY_HOSTNAME/$PUNY_PRIMARY_HOSTNAME/" \
         > /var/lib/s5mail/mta-sts.txt
chmod a+r /var/lib/s5mail/mta-sts.txt

# Start services.
restart_service nginx
restart_service php"$PHP_VER"-fpm

# Open ports.
ufw_allow http
ufw_allow https
