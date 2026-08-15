import { expect, login, test, visitPanel } from "./fixtures.js";

const suffix = process.env.MIAB_E2E_RUN_ID || "native-js";
const alias = `${suffix}-alias@mailinabox.lan`;
const dnsName = `${suffix}.mailinabox.lan`;

async function post(request, path, credentials, form) {
  return request.post(path, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.session_key}`).toString("base64")}`,
      "X-Requested-With": "XMLHttpRequest",
    },
    form,
  });
}

async function credentials(page) {
  return page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem("miab-cp-credentials") || localStorage.getItem("miab-cp-credentials"),
    ),
  );
}

async function dismissResult(page) {
  const modal = page.locator("#global_modal");
  await expect(modal).toBeVisible();
  await modal.locator(".btn-default").click({ force: true });
  await expect(modal).toBeHidden();
}

test.beforeEach(async ({ page }) => login(page));

test.afterEach(async ({ page, request }) => {
  const auth = await credentials(page).catch(() => null);
  if (!auth) return;
  await post(request, "/admin/mail/aliases/remove", auth, { address: alias });
  await request.delete(`/admin/dns/custom/${dnsName}/TXT`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.session_key}`).toString("base64")}`,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
});

test("generates a user password without creating an account", async ({ page }) => {
  await visitPanel(page, "users", "Users");
  await page.getByRole("link", { name: "generate a random password" }).click();
  await expect(page.locator("#global_modal .modal-body")).toContainText("Here, try this:");
  await page.locator("#global_modal .btn-default").click();
  await expect(page.locator("#global_modal")).toBeHidden();
});

test("creates and removes an alias", async ({ page }) => {
  await visitPanel(page, "aliases", "Aliases");
  await page.locator("#addaliasAddress").fill(alias);
  await page.locator("#addaliasForwardsTo").fill("me@mailinabox.lan");
  await page.getByRole("button", { name: "Add Alias" }).click();
  await dismissResult(page);
  const row = page.locator("#alias_table tr", { hasText: alias });
  await expect(row).toBeVisible();
  await row.getByTitle("Remove Alias").click();
  await expect(page.locator("#global_modal")).toBeVisible();
  await page.locator("#global_modal .btn-danger").click({ force: true });
  await expect(row).toBeHidden();
});

test("creates and removes a raw custom DNS record", async ({ page }) => {
  await visitPanel(page, "custom_dns", "Custom DNS");
  await expect.poll(() => page.locator("#customdnsZone").inputValue()).not.toBe("");
  await page.locator("#customdnsQname").fill(suffix);
  await page.locator("#customdnsType").selectOption("TXT");
  await page.locator("#customdnsValue").fill("literal browser test");
  await page.getByRole("button", { name: "Set Record" }).click();
  await dismissResult(page);
  const row = page.locator("#custom-dns-current tr", { hasText: dnsName });
  await expect(row).toContainText("literal browser test");
  await row.getByRole("link", { name: "delete" }).click();
  await expect(row).toBeHidden();
});
