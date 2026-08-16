#!/usr/bin/env python3

import os
import unittest


REPOSITORY_ROOT = os.path.dirname(os.path.dirname(__file__))


def read_repo_file(*parts):
	with open(os.path.join(REPOSITORY_ROOT, *parts), encoding="utf-8") as file:
		return file.read()


class DebianPlatformConfigurationTests(unittest.TestCase):
	def test_hostname_is_made_locally_resolvable(self):
		system_setup = read_repo_file("setup", "system.sh")
		self.assertIn("127.0.1.1", system_setup)
		self.assertIn("${PRIMARY_HOSTNAME%%.*}", system_setup)

	def test_management_unit_is_installed_as_a_local_unit(self):
		management_setup = read_repo_file("setup", "management.sh")
		self.assertIn(
			"cp --remove-destination conf/s5mail.service /etc/systemd/system/s5mail.service",
			management_setup,
		)
		self.assertNotIn("systemctl link", management_setup)

	def test_munin_unit_is_installed_as_a_local_unit(self):
		munin_setup = read_repo_file("setup", "munin.sh")
		self.assertIn(
			"cp --remove-destination conf/munin.service /etc/systemd/system/munin.service",
			munin_setup,
		)
		self.assertNotIn("systemctl link", munin_setup)

	def test_dns_sshfp_generation_does_not_request_removed_dsa_keys(self):
		dns_update = read_repo_file("management", "dns_update.py")
		self.assertIn('"rsa,ecdsa,ed25519"', dns_update)
		self.assertNotIn('"rsa,dsa,ecdsa,ed25519"', dns_update)

	def test_first_user_setup_repairs_interrupted_admin_steps(self):
		first_user_setup = read_repo_file("setup", "firstuser.sh")
		self.assertIn("MAIL_ADMINS=$(management/cli.py user admins)", first_user_setup)
		self.assertIn("SELECT 1 FROM aliases", first_user_setup)

	def test_munin_oneshot_remains_active_after_preparing_runtime_state(self):
		munin_unit = read_repo_file("conf", "munin.service")
		self.assertIn("Type=oneshot", munin_unit)
		self.assertIn("RemainAfterExit=yes", munin_unit)

	def test_postfix_uses_its_native_dh_defaults(self):
		postfix_setup = read_repo_file("setup", "mail-postfix.sh")
		self.assertIn("smtpd_tls_dh1024_param_file=", postfix_setup)
		self.assertNotIn('smtpd_tls_dh1024_param_file="$STORAGE_ROOT', postfix_setup)


if __name__ == "__main__":
	unittest.main()
