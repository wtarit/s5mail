#!/usr/bin/env python3

import os
import unittest


REPOSITORY_ROOT = os.path.dirname(os.path.dirname(__file__))


def read_repo_file(*parts):
	with open(os.path.join(REPOSITORY_ROOT, *parts), encoding="utf-8") as file:
		return file.read()


class NextcloudRootConfigurationTests(unittest.TestCase):
	def setUp(self):
		self.base = read_repo_file("conf", "nginx.conf")
		self.primary = read_repo_file("conf", "nginx-primaryonly.conf")
		self.all_domains = read_repo_file("conf", "nginx-alldomains.conf")
		self.generator = read_repo_file("management", "nginx_update.py")

	def test_nextcloud_is_at_root_without_legacy_web_roots(self):
		self.assertIn("root $WEB_ROOT;", self.base)
		self.assertNotIn("root /usr/local/lib/owncloud;", self.primary)
		self.assertIn('"/usr/local/lib/owncloud" if domain == env[\'PRIMARY_HOSTNAME\']', self.generator)
		self.assertIn('else "/tmp/invalid-path-nothing-here"', self.generator)
		self.assertIn("try_files $uri $uri/ /index.php$request_uri;", self.primary)
		self.assertNotIn("location = /mail", self.primary)
		self.assertNotIn("location ^~ /mail/", self.primary)
		self.assertNotIn("location = /cloud", self.primary)
		self.assertNotIn("location ^~ /cloud/", self.primary)
		self.assertNotIn("roundcubemail", self.primary.lower())
		self.assertNotIn("roundcubemail", self.all_domains.lower())
		self.assertIn("location = /admin/munin", self.primary)
		self.assertIn("return 302 /admin/munin/;", self.primary)

	def test_nextcloud_protected_paths_are_before_php_fallback(self):
		protected = self.primary.index("location ~ ^/(?:build")
		php = self.primary.index("location ~ \\.php")
		self.assertLess(protected, php)
		self.assertIn("README(?:$|[./])", self.primary)
		self.assertIn("HTTP_PROXY \"\"", self.primary)
		self.assertIn("modHeadersAvailable true", self.primary)

	def test_mail_account_is_provisioned_through_nextcloud_api(self):
		nextcloud_setup = read_repo_file("setup", "nextcloud.sh")
		start_setup = read_repo_file("setup", "start.sh")
		self.assertIn("ConfigureNextcloudMailProvisioning()", nextcloud_setup)
		self.assertIn("/apps/mail/api/settings/provisioning", nextcloud_setup)
		self.assertIn('"provisioningDomain":"*"', nextcloud_setup)
		self.assertIn('"emailTemplate":"%USERID%"', nextcloud_setup)
		self.assertIn('"imapPort":993,"imapSslMode":"ssl"', nextcloud_setup)
		self.assertIn('"smtpPort":587,"smtpSslMode":"tls"', nextcloud_setup)
		self.assertIn('"sievePort":4190,"sieveSslMode":"tls"', nextcloud_setup)
		self.assertIn("user:auth-tokens:delete", nextcloud_setup)
		self.assertIn("ConfigureNextcloudMailProvisioning", start_setup)


class AccountPasswordUiTests(unittest.TestCase):
	def test_regular_users_are_not_rejected_after_successful_login(self):
		login_js = read_repo_file("management", "assets", "panels", "login.js")
		self.assertNotIn("You are not an administrator on this system.", login_js)
		self.assertIn('"api_key" in response', login_js)
		self.assertIn("Admin-only panels are hidden", login_js)

	def test_password_panel_uses_self_service_endpoint(self):
		panel_js = read_repo_file("management", "assets", "panels", "account-password.js")
		self.assertIn('"/mail/users/me/password"', panel_js)


if __name__ == "__main__":
	unittest.main()
