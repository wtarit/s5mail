#!/usr/bin/env python3

import os
import shutil
import subprocess
import tempfile
import unittest


REPOSITORY_ROOT = os.path.dirname(os.path.dirname(__file__))
TEMPLATE_PATH = os.path.join(REPOSITORY_ROOT, "conf", "dovecot", "dovecot.conf")


class Dovecot24ConfigurationTests(unittest.TestCase):
	def setUp(self):
		with open(TEMPLATE_PATH, encoding="utf-8") as template_file:
			self.template = template_file.read()
		with open(os.path.join(REPOSITORY_ROOT, "setup", "mail-dovecot.sh"), encoding="utf-8") as setup_file:
			self.setup = setup_file.read()

	def test_creates_the_optional_debian_sysctl_file(self):
		self.assertIn("if [ ! -e /etc/sysctl.conf ]; then", self.setup)
		self.assertIn("install -m 0644 /dev/null /etc/sysctl.conf", self.setup)

	def test_uses_a_complete_native_24_configuration(self):
		self.assertIn("dovecot_config_version = 2.4.0", self.template)
		self.assertIn("dovecot_storage_version = 2.4.0", self.template)
		self.assertNotIn("!include", self.template)
		self.assertIn("passdb sql {", self.template)
		self.assertIn("userdb sql {", self.template)
		self.assertIn("quota_storage_size", self.template)
		self.assertNotIn("quota_rule", self.template)
		self.assertNotIn("auth-system.conf", self.template)
		self.assertIn("first_valid_uid = 8", self.template)
		self.assertIn("/var/spool/postfix/private/auth", self.template)
		self.assertIn("port = 10026", self.template)
		self.assertIn("port = 993", self.template)
		self.assertIn("port = 995", self.template)
		self.assertIn("port = 4190", self.template)
		self.assertIn("inet_listener imap {\n    port = 0", self.template)
		self.assertIn("inet_listener imap-local {\n    listen = 127.0.0.1\n    port = 143\n    ssl = no", self.template)
		self.assertIn("inet_listener pop3 {\n    port = 0", self.template)
		self.assertIn("inet_listener sieve_deprecated {\n    port = 0", self.template)
		self.assertIn("path = /etc/dovecot/sieve/before", self.template)
		self.assertIn("sieve_script personal {", self.template)

	def test_doveconf_accepts_a_rendered_template_when_available(self):
		if shutil.which("doveconf") is None:
			self.skipTest("Dovecot is not installed")

		with tempfile.TemporaryDirectory() as temporary_directory:
			storage_root = os.path.join(temporary_directory, "storage")
			os.makedirs(os.path.join(storage_root, "mail"))
			with open(os.path.join(temporary_directory, "dovecot.conf"), "w", encoding="utf-8") as config_file:
				config_file.write(
					self.template
					.replace("__STORAGE_ROOT__", storage_root)
					.replace("__PRIMARY_HOSTNAME__", "mail.example.test"))

			result = subprocess.run(
				["doveconf", "-c", config_file.name, "-n"],
				capture_output=True,
				check=False,
				text=True,
			)
			self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
	unittest.main()
