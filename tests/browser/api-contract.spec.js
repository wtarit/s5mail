import { expect, expectConsoleError, login, test, visitPanel } from "./fixtures.js";

test("fetch sends auth, AJAX, and URL-encoded form headers", async ({ page }) => {
  await login(page);
  let captured;
  await page.route("**/admin/mail/users/add", async (route) => {
    captured = route.request();
    await route.fulfill({ status: 200, contentType: "text/plain", body: "test response" });
  });
  await visitPanel(page, "users", "Users");
  await page.locator("#adduserEmail").fill("encoded+test@mailinabox.lan");
  await page.locator("#adduserPassword").fill("TestPass123456");
  await page.getByRole("button", { name: "Add User" }).click();
  await expect(page.locator("#global_modal")).toContainText("test response");
  expect(captured.headers().authorization).toMatch(/^Basic /);
  expect(captured.headers()["x-requested-with"]).toBe("XMLHttpRequest");
  expect(captured.headers()["content-type"]).toContain("application/x-www-form-urlencoded");
  expect(captured.postData()).toContain("email=encoded%2Btest%40mailinabox.lan");
});

test("fetch sends raw DNS bodies and parses JSON responses", async ({ page }) => {
  await login(page);
  let captured;
  await page.route("**/admin/dns/custom/raw.mailinabox.lan/TXT", async (route) => {
    captured = route.request();
    await route.fulfill({ status: 200, contentType: "text/plain", body: "set" });
  });
  await visitPanel(page, "custom_dns", "Custom DNS");
  await expect.poll(() => page.locator("#customdnsZone").inputValue()).not.toBe("");
  await page.locator("#customdnsQname").fill("raw");
  await page.locator("#customdnsType").selectOption("TXT");
  await page.locator("#customdnsValue").fill("unencoded & literal");
  await page.getByRole("button", { name: "Set Record" }).click();
  await expect(page.locator("#global_modal")).toContainText("set");
  expect(captured.headers()["content-type"]).toContain("text/plain");
  expect(captured.postData()).toBe("unencoded & literal");
  await visitPanel(page, "users", "Users");
  await expect(page.locator("#user_table")).toContainText("me@mailinabox.lan");
});

test("HTTP failures call the error path", async ({ page }) => {
  await login(page);
  expectConsoleError(page, "status of 503");
  await page.route("**/admin/mail/aliases/add", (route) =>
    route.fulfill({ status: 503, contentType: "text/plain", body: "service unavailable" }),
  );
  await visitPanel(page, "aliases", "Aliases");
  await page.locator("#addaliasAddress").fill("failure@mailinabox.lan");
  await page.locator("#addaliasForwardsTo").fill("me@mailinabox.lan");
  await page.getByRole("button", { name: "Add Alias" }).click();
  await expect(page.locator("#global_modal")).toContainText("service unavailable");
});
