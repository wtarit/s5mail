#!/usr/bin/env python3

import os
import unittest


REPOSITORY_ROOT = os.path.dirname(os.path.dirname(__file__))


def read_repo_file(*parts):
	with open(os.path.join(REPOSITORY_ROOT, *parts), encoding="utf-8") as file:
		return file.read()


class RspamdCutoverTests(unittest.TestCase):
	def setUp(self):
		self.setup = read_repo_file("setup", "rspamd.sh")
		self.postfix = read_repo_file("setup", "mail-postfix.sh")
		self.dns_update = read_repo_file("management", "dns_update.py")

	def test_rspamd_is_the_only_postfix_filter(self):
		self.assertIn("smtpd_milters=inet:127.0.0.1:11332", self.postfix)
		self.assertIn("non_smtpd_milters=\\$smtpd_milters", self.postfix)
		self.assertNotIn("127.0.0.1:10023", self.postfix)
		self.assertNotIn("127.0.0.1:10025", self.postfix)

	def test_small_vps_profile_is_bounded_and_loopback_only(self):
		self.assertIn('bind_socket = "127.0.0.1:11332";', self.setup)
		self.assertIn('bind_socket = "127.0.0.1:11334";', self.setup)
		self.assertIn("maxmemory 64mb", self.setup)
		self.assertIn("maxmemory-policy allkeys-lru", self.setup)
		self.assertIn("disable_hyperscan = true", self.setup)
		self.assertIn("count = 1;", self.setup)
		self.assertIn("enabled = false;", self.setup)

	def test_spam_delivery_and_learning_are_both_installed(self):
		self.assertIn("10-rspamd-file-spam.sieve", self.setup)
		self.assertIn("rspamd-learn-spam.sieve", self.setup)
		self.assertIn("rspamd-learn-ham.sieve", self.setup)

	def test_dkim_key_is_not_world_readable(self):
		self.assertIn('chown "${STORAGE_USER}:_rspamd" "$STORAGE_ROOT/mail/dkim"', self.setup)
		self.assertIn('chmod 0640 "$STORAGE_ROOT/mail/dkim/mail.private"', self.setup)
		self.assertIn('signing_table = "/etc/rspamd/s5mail-dkim/SigningTable"', self.setup)
		self.assertIn('key_table = "/etc/rspamd/s5mail-dkim/KeyTable"', self.setup)
		self.assertIn("def write_rspamd_dkim_tables", self.dns_update)
		self.assertIn('f"*@{domain} {domain}\\n"', self.dns_update)


if __name__ == "__main__":
	unittest.main()
