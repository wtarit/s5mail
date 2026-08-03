# Changelog

All notable changes to S5 Mail are documented in this file.

S5 Mail was forked from
[Mail-in-a-Box v76](https://github.com/mail-in-a-box/mailinabox/tree/v76).
For releases before the fork, see the
[Mail-in-a-Box changelog](https://github.com/mail-in-a-box/mailinabox/blob/v76/CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).

## Unreleased

### Added

- Added configurable external SMTP relay.
- Added control-panel settings for SMTP relay authentication.
- Added an option to disable Postgrey.

### Changed

- Upgraded PHP to 8.2.
- Upgraded Nextcloud to 34.
- Upgraded Roundcube to 1.7.2.
- Changed Python runtime and dependency management to use uv.

### Removed

- Removed Z-Push provisioning.

### Upgrade notes

- Existing Mail-in-a-Box installations must be upgraded to upstream v76
  before switching to S5 Mail.
- Back up the installation before switching.
