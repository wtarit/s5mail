# S5 Mail

Host your own mail server on $5 VPS.

> [!IMPORTANT]
> **Project status:** S5 Mail is under active development. Version **2026.08.2**
> is the final release for Ubuntu 22.04 LTS. Installations currently running
> the original v76 release must upgrade to S5 Mail 2026.08.2 before moving to
> a future release. New installations are not recommended until the Debian
> 13-based version of S5 Mail is released.

S5 Mail 2026.08.2 supports fresh installations on Ubuntu 22.04 LTS and upgrades
from Mail-in-a-Box v76. Back up an existing installation before upgrading. For
either installation path, run:

```sh
curl -fsSL https://raw.githubusercontent.com/wtarit/s5mail/v2026.08.2/setup/bootstrap.sh | sudo bash
```

See the [S5 Mail 2026.08.2 release notes](https://github.com/wtarit/s5mail/releases/tag/v2026.08.2)
for changes and upgrade notes.

S5 Mail provisions a complete, self-hosted mail server and control panel.

In The Box
----------

S5 Mail turns a fresh Ubuntu 22.04 LTS 64-bit machine into a working mail server by installing and configuring various components.

It is an email appliance with sensible defaults and optional configuration during setup.

The components installed are:

* SMTP ([postfix](http://www.postfix.org/)), IMAP ([Dovecot](http://dovecot.org/)), and CardDAV/CalDAV ([Nextcloud](https://nextcloud.com/)) servers
* Webmail ([Roundcube](http://roundcube.net/)), mail filter rules (thanks to Roundcube and Dovecot), and email client autoconfig settings (served by [nginx](http://nginx.org/))
* Spam filtering ([spamassassin](https://spamassassin.apache.org/)) and greylisting ([postgrey](http://postgrey.schweikert.ch/))
* DNS ([nsd4](https://www.nlnetlabs.nl/projects/nsd/)) with [SPF](https://en.wikipedia.org/wiki/Sender_Policy_Framework), DKIM ([OpenDKIM](http://www.opendkim.org/)), [DMARC](https://en.wikipedia.org/wiki/DMARC), [DNSSEC](https://en.wikipedia.org/wiki/DNSSEC), [DANE TLSA](https://en.wikipedia.org/wiki/DNS-based_Authentication_of_Named_Entities), [MTA-STS](https://tools.ietf.org/html/rfc8461), and [SSHFP](https://tools.ietf.org/html/rfc4255) policy records automatically set
* TLS certificates are automatically provisioned using [Let's Encrypt](https://letsencrypt.org/) for protecting https and all of the other services on the box
* Backups ([duplicity](https://duplicity.us/)), firewall ([ufw](https://launchpad.net/ufw)), intrusion protection ([fail2ban](http://www.fail2ban.org/wiki/index.php/Main_Page)), and basic system monitoring ([munin](http://munin-monitoring.org/))

It also includes system management tools:

* Comprehensive health monitoring that checks each day that services are running, ports are open, TLS certificates are valid, and DNS records are correct
* A control panel for adding/removing mail users, aliases, custom DNS records, configuring backups, etc.
* An API for all of the actions on the control panel

Internationalized domain names are supported and configured easily (but SMTPUTF8 is not supported, unfortunately).

For more information on how S5 Mail handles your privacy, see the [security details page](security.md).

Optional services
-----------------

Some services can be enabled or disabled during setup. The configurable options currently include:

* Postgrey (enabled by default; disable with `--disable-postgrey`)

Report S5 Mail bugs and development questions through this repository's
[GitHub Issues](https://github.com/wtarit/s5mail/issues).

Note that while we want everything to "just work," we can't control the rest of the Internet. Other mail services might block or spam-filter email sent from your S5 Mail server.
This is a challenge faced by everyone who runs their own mail server.


Contributing and Development
----------------------------

S5 Mail is an open source project. Contributions and pull requests are welcome. See [CONTRIBUTING](CONTRIBUTING.md) to get started.


Origin
------

S5 Mail was originally forked from
[Mail-in-a-Box v76](https://github.com/mail-in-a-box/mailinabox/tree/v76).
