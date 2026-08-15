# Creates an nginx configuration file for the domains that have mail services.
########################################################################

import os.path, re

from mailconfig import get_mail_domains
from dns_update import get_custom_dns_config
from ssl_certificates import get_ssl_certificates, get_domain_ssl_files
from utils import shell, sort_domains


def get_web_domains(env, include_auto=True, exclude_dns_elsewhere=True):
	# What domains should nginx serve HTTPS for?
	domains = set()

	# Serve all mail domains for webmail and email autodiscovery.
	domains |= get_mail_domains(env)

	if include_auto:
		# Add Autoconfiguration domains for domains that there are user accounts at:
		# 'autoconfig.' for Mozilla Thunderbird auto setup.
		domains |= {'autoconfig.' + maildomain for maildomain in get_mail_domains(env, users_only=True)}

		# 'mta-sts.' for MTA-STS support for all domains that have email addresses.
		domains |= {'mta-sts.' + maildomain for maildomain in get_mail_domains(env)}

	if exclude_dns_elsewhere:
		# ...Unless the domain has an A/AAAA record that maps it to a different
		# IP address than this box. Remove those domains from our list.
		domains -= get_domains_with_a_records(env)

	# Ensure the PRIMARY_HOSTNAME is in the list so we can serve webmail.
	# This can't be removed by a custom A/AAAA record.
	domains.add(env['PRIMARY_HOSTNAME'])

	# Sort the list so the nginx conf gets written in a stable order.
	return sort_domains(domains, env)


def get_domains_with_a_records(env):
	domains = set()
	dns = get_custom_dns_config(env)
	for domain, rtype, value in dns:
		if rtype == "CNAME" or (rtype in {"A", "AAAA"} and value not in {"local", env['PUBLIC_IP'], env.get('PUBLIC_IPV6')}):
			domains.add(domain)
	return domains


def do_nginx_update(env):
	# Pre-load what SSL certificates we will use for each domain.
	ssl_certificates = get_ssl_certificates(env)

	# Helper for reading config files and templates.
	def read_conf(conf_fn):
		with open(os.path.join(os.path.dirname(__file__), "../conf", conf_fn), encoding='utf-8') as f:
			return f.read()

	# Build an nginx configuration file.
	nginx_conf = read_conf("nginx-top.conf")

	# Load the templates.
	template0 = read_conf("nginx.conf")
	template1 = read_conf("nginx-alldomains.conf")
	template2 = read_conf("nginx-primaryonly.conf")

	# Add the PRIMARY_HOST configuration first so it becomes nginx's default server.
	nginx_conf += make_domain_config(env['PRIMARY_HOSTNAME'], [template0, template1, template2], ssl_certificates, env)

	# Add configuration for all other domains with mail services.
	for domain in get_web_domains(env):
		if domain == env['PRIMARY_HOSTNAME']:
			# PRIMARY_HOSTNAME is handled above.
			continue
		nginx_conf += make_domain_config(domain, [template0, template1], ssl_certificates, env)

	# Did the file change? If not, don't bother writing & restarting nginx.
	nginx_conf_fn = "/etc/nginx/conf.d/local.conf"
	if os.path.exists(nginx_conf_fn):
		with open(nginx_conf_fn, encoding='utf-8') as f:
			if f.read() == nginx_conf:
				return ""

	# Save the file.
	with open(nginx_conf_fn, "w", encoding='utf-8') as f:
		f.write(nginx_conf)

	# Kick nginx. Since this might be called from the management web service,
	# don't do a 'restart'. That would kill the connection before the API returns
	# its response. A 'reload' should be good enough and doesn't break any open
	# connections.
	shell('check_call', ["/usr/sbin/service", "nginx", "reload"])

	return "nginx updated\n"


def make_domain_config(domain, templates, ssl_certificates, env):
	# What private key and SSL certificate will we use for this domain?
	tls_cert = get_domain_ssl_files(domain, ssl_certificates, env)

	# Additional directives make certificate changes visible to nginx and apply
	# the security policy to all HTTPS services.
	def hashfile(filepath):
		import hashlib
		sha1 = hashlib.sha1()
		with open(filepath, 'rb') as f:
			sha1.update(f.read())
		return sha1.hexdigest()

	nginx_conf_extra = "\t# ssl files sha1: {} / {}\n".format(
		hashfile(tls_cert["private-key"]),
		hashfile(tls_cert["certificate"]),
	)
	nginx_conf_extra += '\tadd_header Strict-Transport-Security "max-age=15768000" always;\n'

	# Combine the pieces. Iteratively place each template into the
	# "# ADDITIONAL DIRECTIVES HERE" placeholder of the previous template.
	nginx_conf = "# ADDITIONAL DIRECTIVES HERE\n"
	for template in [*templates, nginx_conf_extra]:
		nginx_conf = re.sub("[ \\t]*# ADDITIONAL DIRECTIVES HERE *\n", template, nginx_conf)

	# Replace substitution strings in the template and return.
	nginx_conf = nginx_conf.replace("$STORAGE_ROOT", env['STORAGE_ROOT'])
	nginx_conf = nginx_conf.replace("$HOSTNAME", domain)
	nginx_conf = nginx_conf.replace("$SSL_KEY", tls_cert["private-key"])
	nginx_conf = nginx_conf.replace("$SSL_CERTIFICATE", tls_cert["certificate"])
	return nginx_conf
