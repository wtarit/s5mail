# Changelog

All notable changes to S5 Mail are documented in this file.

S5 Mail was forked from
[Mail-in-a-Box v76](https://github.com/mail-in-a-box/mailinabox/tree/v76).
For releases before the fork, see the
[Mail-in-a-Box changelog](https://github.com/mail-in-a-box/mailinabox/blob/v76/CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).

## [Unreleased]

### Removed

- Removed POP3/POP3S support. Mail clients must use IMAP over TLS on port 993
  for incoming mail.

## [2026.08.2] - 2026-08-15

### Fixed

- Prevented Nextcloud web requests and scheduled jobs from locking its SQLite
  database during backup, schema migration, and deferred maintenance work.
- Made interrupted Nextcloud upgrades resume unfinished database maintenance
  even when the recorded application version already advanced.

### Upgrade notes

- This release supersedes 2026.08.1 as the final S5 Mail release for Ubuntu
  22.04 LTS.
- Installations upgrading from Mail-in-a-Box v76 should use this release.

## [2026.08.1] - 2026-08-15

### Added

- Added configurable external SMTP relay.
- Added control-panel status checks for SMTP relay authentication.
- Added an option to disable Postgrey.

### Changed

- Upgraded PHP to 8.2.
- Upgraded Nextcloud to 34.
- Upgraded Roundcube to 1.7.2.
- Changed Python runtime and dependency management to use uv.
- Replaced the management interface's jQuery and Bootstrap JavaScript with
  native browser APIs.
- Renamed the product to S5 Mail and moved installer, update, API, and support
  links to the S5 Mail repository.
- Adopted S5 Mail names for the command, service, configuration, runtime files,
  API specification, and development environment while retaining upgrade
  compatibility with v76 installations.
- Marked this as the final release for Ubuntu 22.04 LTS. Future development
  will target Debian 13.

### Removed

- Removed Z-Push provisioning.
- Removed static website hosting.

### Upgrade notes

- Installations from the original project must be upgraded to v76 before
  switching to S5 Mail.
- Back up the installation before switching.
- New installations are not recommended until the Debian 13-based release is
  available.

[Unreleased]: https://github.com/wtarit/s5mail/compare/v2026.08.2...HEAD
[2026.08.2]: https://github.com/wtarit/s5mail/releases/tag/v2026.08.2
[2026.08.1]: https://github.com/wtarit/s5mail/releases/tag/v2026.08.1
