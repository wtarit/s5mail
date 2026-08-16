#!/bin/bash
#
# Postfix (SMTP)
# --------------
#
# Postfix handles the transmission of email between servers
# using the SMTP protocol. It is a Mail Transfer Agent (MTA).
#
# Postfix listens on port 25 (SMTP) for incoming mail from
# other servers on the Internet. It is responsible for very
# basic email filtering such as by IP address,
# it checks that the destination address is valid, rewrites
# destinations according to aliases, and passes email on to
# another service for local mail delivery.
#
# Incoming mail is delivered to Dovecot over LMTP. Rspamd filters mail
# through Postfix's loopback-only milter before delivery.
#
# Postfix also listens on ports 465/587 (SMTPS, SMTP+STARTTLS) for
# connections from users who can authenticate and then sends
# their email out to the outside world. Postfix queries Dovecot
# to authenticate users.
#
# Address validation, alias rewriting, and user authentication
# is configured in a separate setup script mail-users.sh
# because of the overlap of this part with the Dovecot
# configuration.

source setup/functions.sh # load our functions
source /etc/s5mail.conf # load global vars

# ### Install packages.

# Install postfix's packages.
#
# * `postfix`: The SMTP server.
# * `postfix-pcre`: Enables header filtering.
# * `ca-certificates`: A trust store used to squelch postfix warnings about
#   untrusted opportunistically-encrypted connections.
echo "Installing Postfix (SMTP server)..."
postfix_packages=(postfix postfix-sqlite postfix-pcre ca-certificates libsasl2-modules)
apt_install "${postfix_packages[@]}"

# ### Basic Settings

# Set some basic settings...
#
# * Have postfix listen on all network interfaces.
# * Make outgoing connections on a particular interface (if multihomed) so that SPF passes on the receiving side.
# * Set our name (the Debian default seems to be "localhost" but make it our hostname).
# * Set the name of the local machine to localhost, which means xxx@localhost is delivered locally, although we don't use it.
# * Set the SMTP banner (which must have the hostname first, then anything).
tools/editconf.py /etc/postfix/main.cf \
	inet_interfaces=all \
	smtp_bind_address="$PRIVATE_IP" \
	smtp_bind_address6="$PRIVATE_IPV6" \
	myhostname="$PRIMARY_HOSTNAME"\
	smtpd_banner="\$myhostname ESMTP S5 Mail (Postfix)" \
	mydestination=localhost

# Tweak some queue settings:
# * Inform users when their e-mail delivery is delayed more than 3 hours (default is not to warn).
# * Stop trying to send an undeliverable e-mail after 2 days (instead of 5), and for bounce messages just try for 1 day.
tools/editconf.py /etc/postfix/main.cf \
	delay_warning_time=3h \
	maximal_queue_lifetime=2d \
	bounce_queue_lifetime=1d

# Guard against SMTP smuggling
# This "long-term" fix is recommended at https://www.postfix.org/smtp-smuggling.html.
# This is the default in Debian 13's Postfix 3.10. The "short-term" workarounds
# that we previously had are reverted to postfix defaults (though smtpd_discard_ehlo_keywords
# was never included in a released version of S5 Mail).
tools/editconf.py /etc/postfix/main.cf -e \
       smtpd_data_restrictions= \
       smtpd_discard_ehlo_keywords=
tools/editconf.py /etc/postfix/main.cf \
       smtpd_forbid_bare_newline=normalize

# ### Outgoing Mail

# Enable the 'submission' ports 465 and 587 and tweak their settings.
#
# * Enable authentication. It's disabled globally so that it is disabled on port 25,
#   so we need to explicitly enable it here.
# * Send authenticated submissions through the same Rspamd milter so they are
#   DKIM-signed, while Rspamd recognizes the authenticated sender.
# * Even though we dont allow auth over non-TLS connections (smtpd_tls_auth_only below, and without auth the client cant
#   send outbound mail), don't allow non-TLS mail submission on this port anyway to prevent accidental misconfiguration.
#   Setting smtpd_tls_security_level=encrypt also triggers the use of the 'mandatory' settings below (but this is ignored with smtpd_tls_wrappermode=yes.)
# * Give it a different name in syslog to distinguish it from the port 25 smtpd server.
# * Add a new cleanup service specific to the submission service ('authclean')
#   that filters out privacy-sensitive headers on mail being sent out by
#   authenticated users.  By default Postfix also applies this to attached
#   emails but we turn this off by setting nested_header_checks empty.
tools/editconf.py /etc/postfix/master.cf -s -w \
	"smtps=inet n       -       -       -       -       smtpd
	  -o smtpd_tls_wrappermode=yes
	  -o smtpd_sasl_auth_enable=yes
	  -o syslog_name=postfix/submission
	  -o smtpd_milters=inet:127.0.0.1:11332
	  -o cleanup_service_name=authclean" \
	"submission=inet n       -       -       -       -       smtpd
	  -o smtpd_sasl_auth_enable=yes
	  -o syslog_name=postfix/submission
	  -o smtpd_milters=inet:127.0.0.1:11332
	  -o smtpd_tls_security_level=encrypt
	  -o cleanup_service_name=authclean" \
	"authclean=unix  n       -       -       -       0       cleanup
	  -o header_checks=pcre:/etc/postfix/outgoing_mail_header_filters
	  -o nested_header_checks="

# Install the `outgoing_mail_header_filters` file required by the new 'authclean' service.
cp conf/postfix_outgoing_mail_header_filters /etc/postfix/outgoing_mail_header_filters

# Modify the `outgoing_mail_header_filters` file to use the local machine name and ip
# on the first received header line.  This may help reduce the spam score of email by
# removing the 127.0.0.1 reference.
sed -i "s/PRIMARY_HOSTNAME/$PRIMARY_HOSTNAME/" /etc/postfix/outgoing_mail_header_filters
sed -i "s/PUBLIC_IP/$PUBLIC_IP/" /etc/postfix/outgoing_mail_header_filters

# Enable TLS on incoming connections. It is not required on port 25, allowing for opportunistic
# encryption. On ports 465 and 587 it is mandatory (see above). Shared and non-shared settings are
# given here. Shared settings include:
# * Require TLS before a user is allowed to authenticate.
# * Set the path to the server TLS certificate and 2048-bit DH parameters for old DH ciphers.
# For port 25 only:
# * Disable extremely old versions of TLS and extremely unsafe ciphers, but some mail servers out in
#   the world are very far behind and if we disable too much, they may not be able to use TLS and
#   won't fall back to cleartext. So we don't disable too much. smtpd_tls_exclude_ciphers applies to
#   both port 25 and port 587, but because we override the cipher list for both, it probably isn't used.
#   Use Mozilla's "Old" recommendations at https://ssl-config.mozilla.org/#server=postfix&server-version=3.3.0&config=old&openssl-version=1.1.1
tools/editconf.py /etc/postfix/main.cf -e \
	smtpd_tls_security_level=may\
	smtpd_tls_auth_only=yes \
	smtpd_tls_cert_file="$STORAGE_ROOT/ssl/ssl_certificate.pem" \
	smtpd_tls_key_file="$STORAGE_ROOT/ssl/ssl_private_key.pem" \
	smtpd_tls_dh1024_param_file= \
	smtpd_tls_protocols="!SSLv2,!SSLv3" \
	smtpd_tls_ciphers=medium \
	tls_medium_cipherlist=ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES256-SHA256:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA256:AES256-SHA256:AES128-SHA:AES256-SHA:DES-CBC3-SHA \
	smtpd_tls_exclude_ciphers=aNULL,RC4 \
	tls_preempt_cipherlist=no \
	smtpd_tls_received_header=yes

# For ports 465/587 (via the 'mandatory' settings):
# * Use Mozilla's "Intermediate" TLS recommendations from https://ssl-config.mozilla.org/#server=postfix&server-version=3.3.0&config=intermediate&openssl-version=1.1.1
#   using and overriding the "high" cipher list so we don't conflict with the more permissive settings for port 25.
tools/editconf.py /etc/postfix/main.cf \
	smtpd_tls_mandatory_protocols="!SSLv2,!SSLv3,!TLSv1,!TLSv1.1" \
	smtpd_tls_mandatory_ciphers=high \
	tls_high_cipherlist=ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384 \
	smtpd_tls_mandatory_exclude_ciphers=aNULL,DES,3DES,MD5,DES+MD5,RC4

# Prevent non-authenticated users from sending mail that requires being
# relayed elsewhere. We don't want to be an "open relay". On outbound
# mail, require one of:
#
# * `permit_sasl_authenticated`: Authenticated users (i.e. on port 465/587).
# * `permit_mynetworks`: Mail that originates locally.
# * `reject_unauth_destination`: No one else. (Permits mail whose destination is local and rejects other mail.)
tools/editconf.py /etc/postfix/main.cf \
	smtpd_relay_restrictions=permit_sasl_authenticated,permit_mynetworks,reject_unauth_destination


# ### DANE

# When connecting to remote SMTP servers, prefer TLS and use DANE if available.
#
# Preferring ("opportunistic") TLS means Postfix will use TLS if the remote end
# offers it, otherwise it will transmit the message in the clear. Postfix will
# accept whatever SSL certificate the remote end provides. Opportunistic TLS
# protects against passive easvesdropping (but not man-in-the-middle attacks).
# Since we'd rather have poor encryption than none at all, we use Mozilla's
# "Old" recommendations at https://ssl-config.mozilla.org/#server=postfix&server-version=3.3.0&config=old&openssl-version=1.1.1
# for opportunistic encryption but "Intermediate" recommendations when DANE
# is used (see next and above). The cipher lists are set above.

# DANE takes this a step further:
# Postfix queries DNS for the TLSA record on the destination MX host. If no TLSA records are found,
# then opportunistic TLS is used. Otherwise the server certificate must match the TLSA records
# or else the mail bounces. TLSA also requires DNSSEC on the MX host. Postfix doesn't do DNSSEC
# itself but assumes the system's nameserver does and reports DNSSEC status. Thus this also
# relies on our local DNS server (see system.sh) and `smtp_dns_support_level=dnssec`.
#
# The `smtp_tls_CAfile` is superfluous, but it eliminates warnings in the logs about untrusted certs,
# which we don't care about seeing because Postfix is doing opportunistic TLS anyway. Better to encrypt,
# even if we don't know if it's to the right party, than to not encrypt at all. Instead we'll
# now see notices about trusted certs. The CA file is provided by the package `ca-certificates`.
tools/editconf.py /etc/postfix/main.cf \
	smtp_tls_protocols=\!SSLv2,\!SSLv3 \
	smtp_tls_ciphers=medium \
	smtp_tls_exclude_ciphers=aNULL,RC4 \
	smtp_tls_mandatory_protocols="!SSLv2,!SSLv3,!TLSv1,!TLSv1.1" \
	smtp_tls_mandatory_ciphers=high \
	smtp_tls_CAfile=/etc/ssl/certs/ca-certificates.crt \
	smtp_tls_loglevel=2

if [ "$ENABLE_SMTP_RELAY" = "1" ]; then
	# Route every non-local message through one authenticated, TLS-verified
	# relay. The bracketed hostname disables MX lookups and must exactly match
	# the key in smtp_sasl_password_maps.
	SMTP_RELAY_DESTINATION="[$SMTP_RELAY_HOST]:$SMTP_RELAY_PORT"

	if [ -n "${SMTP_RELAY_PASSWORD:-}" ]; then
		(umask 077; printf '%s %s:%s\n' \
			"$SMTP_RELAY_DESTINATION" \
			"$SMTP_RELAY_USERNAME" \
			"$SMTP_RELAY_PASSWORD" > /etc/postfix/sasl_passwd)
	fi
	if ! "$S5MAIL_PYTHON" management/smtp_relay.py has-credentials \
		--host "$SMTP_RELAY_HOST" \
		--port "$SMTP_RELAY_PORT" \
		--security "$SMTP_RELAY_SECURITY" \
		--username "$SMTP_RELAY_USERNAME" >/dev/null 2>&1; then
		echo "SMTP relay credentials are missing from /etc/postfix/sasl_passwd." >&2
		exit 2
	fi

	postmap hash:/etc/postfix/sasl_passwd
	chmod 600 /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db

	SMTP_RELAY_WRAPPERMODE=
	if [ "$SMTP_RELAY_SECURITY" = "implicit-tls" ]; then
		SMTP_RELAY_WRAPPERMODE=yes
	fi
	tools/editconf.py /etc/postfix/main.cf -e \
		relayhost="$SMTP_RELAY_DESTINATION" \
		smtp_tls_security_level=secure \
		smtp_dns_support_level=enabled \
		smtp_tls_wrappermode="$SMTP_RELAY_WRAPPERMODE" \
		smtp_sasl_auth_enable=yes \
		smtp_sasl_password_maps=hash:/etc/postfix/sasl_passwd \
		smtp_sasl_security_options=noanonymous \
		smtp_sasl_tls_security_options=noanonymous
else
	# Restore direct delivery with opportunistic DANE and remove any credentials
	# left by a previously-enabled relay.
	tools/editconf.py /etc/postfix/main.cf -e \
		relayhost= \
		smtp_tls_security_level=dane \
		smtp_dns_support_level=dnssec \
		smtp_tls_wrappermode= \
		smtp_sasl_auth_enable= \
		smtp_sasl_password_maps= \
		smtp_sasl_security_options= \
		smtp_sasl_tls_security_options=
	rm -f /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db
fi

unset SMTP_RELAY_PASSWORD

# ### Incoming Mail

# Rspamd is a Postfix milter, so it does not sit in the LMTP delivery path.
# Deliver directly to Dovecot's loopback-only LMTP listener.
tools/editconf.py /etc/postfix/main.cf "virtual_transport=lmtp:[127.0.0.1]:10026"
tools/editconf.py /etc/postfix/main.cf  -e lmtp_destination_recipient_limit=


# Who can send mail to us? Some basic filters.
#
# * `reject_non_fqdn_sender`: Reject not-nice-looking return paths.
# * `reject_unknown_sender_domain`: Reject return paths with invalid domains.
# * `reject_authenticated_sender_login_mismatch`: Reject if mail FROM address does not match the client SASL login
# * `reject_rhsbl_sender`: Reject return paths that use blacklisted domains.
# * `permit_sasl_authenticated`: Authenticated users (i.e. on port 587) can skip further checks.
# * `permit_mynetworks`: Mail that originates locally can skip further checks.
# * `reject_rbl_client`: Reject connections from IP addresses blacklisted in zen.spamhaus.org
# * `reject_unlisted_recipient`: Although Postfix will reject mail to unknown recipients, it's nicer to reject such mail ahead of greylisting rather than after.
# * `check_policy_service`: Enforce the Dovecot quota status policy.
#
# Note the spamhaus rbl return codes are taken into account as advised here: https://docs.spamhaus.com/datasets/docs/source/40-real-world-usage/PublicMirrors/MTAs/020-Postfix.html
# Notes: #NODOC
# permit_dnswl_client can pass through mail from whitelisted IP addresses, which would be good to put before greylisting #NODOC
# so these IPs get mail delivered quickly. But when an IP is not listed in the permit_dnswl_client list (i.e. it is not #NODOC
# whitelisted) then postfix does a DEFER_IF_REJECT, which results in all "unknown user" sorts of messages turning into #NODOC
# "450 4.7.1 Client host rejected: Service unavailable". This is a retry code, so the mail doesn't properly bounce. #NODOC
tools/editconf.py /etc/postfix/main.cf \
	smtpd_sender_restrictions="reject_non_fqdn_sender,reject_unknown_sender_domain,reject_authenticated_sender_login_mismatch,reject_rhsbl_sender dbl.spamhaus.org=127.0.1.[2..99]" \
	smtpd_recipient_restrictions="permit_sasl_authenticated,permit_mynetworks,reject_rbl_client zen.spamhaus.org=127.0.0.[2..11],reject_unlisted_recipient,check_policy_service inet:127.0.0.1:12340"

# Rspamd performs score-aware greylisting in its loopback-only milter.
# The quota-status policy remains in the recipient restrictions above.
tools/editconf.py /etc/postfix/main.cf \
	"smtpd_milters=inet:127.0.0.1:11332" \
	"non_smtpd_milters=\$smtpd_milters" \
	milter_protocol=6 \
	milter_default_action=accept \
	milter_connect_macros="i j {daemon_name} {daemon_addr} v" \
	milter_helo_macros="i j {daemon_name} {daemon_addr} v _" \
	milter_mail_macros="i j {daemon_name} {daemon_addr} v _ {auth_authen} {auth_author} {auth_type}" \
	milter_rcpt_macros="i j {daemon_name} {daemon_addr} v _ {auth_authen} {auth_author} {auth_type}"

# Increase the message size limit from 10MB to 128MB.
# The same limit is specified in nginx.conf for mail submitted via webmail.
tools/editconf.py /etc/postfix/main.cf \
	message_size_limit=134217728

# Allow the two SMTP ports in the firewall.

ufw_allow smtp
ufw_allow smtps
ufw_allow submission

# Restart services

if [ "$ENABLE_SMTP_RELAY" = "1" ]; then
	hide_output postfix check
fi
restart_service postfix
