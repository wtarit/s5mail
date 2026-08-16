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

	def test_nextcloud_is_at_root_without_legacy_web_roots(self):
		self.assertIn("root /usr/local/lib/owncloud;", self.primary)
		self.assertIn("try_files $uri $uri/ /index.php$request_uri;", self.primary)
		self.assertNotIn("location = /mail", self.primary)
		self.assertNotIn("location ^~ /mail/", self.primary)
		self.assertNotIn("location = /cloud", self.primary)
		self.assertNotIn("location ^~ /cloud/", self.primary)
		self.assertNotIn("roundcubemail", self.primary.lower())
		self.assertNotIn("roundcubemail", self.all_domains.lower())
		self.assertIn("root /tmp/invalid-path-nothing-here;", self.base)
		self.assertIn("location = /admin/munin", self.primary)
		self.assertIn("return 302 /admin/munin/;", self.primary)

	def test_nextcloud_protected_paths_are_before_php_fallback(self):
		protected = self.primary.index("location ~ ^/(?:build")
		php = self.primary.index("location ~ \\.php")
		self.assertLess(protected, php)
		self.assertIn("README(?:$|[./])", self.primary)
		self.assertIn("HTTP_PROXY \"\"", self.primary)
		self.assertIn("modHeadersAvailable true", self.primary)


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
