import { login, test, visitPanel } from "./fixtures.js";

test.beforeEach(async ({ page }) => login(page));

test("all non-destructive admin views render", async ({ page }) => {
  const panels = [
    ["system_status", "System Status Checks"],
    ["users", "Users"],
    ["aliases", "Aliases"],
    ["custom_dns", "Custom DNS"],
    ["external_dns", "External DNS"],
    ["tls", "TLS (SSL) Certificates"],
    ["system_backup", "Backup Status"],
    ["mfa", "Two-Factor Authentication"],
    ["web", "Static Web Hosting"],
  ];
  for (const [hash, heading] of panels) await visitPanel(page, hash, heading);
});
