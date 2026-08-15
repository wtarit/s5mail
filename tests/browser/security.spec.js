import { expect, expectConsoleError, login, test, visitPanel } from "./fixtures.js";

test("reflected API errors render literally without executing HTML", async ({ page }) => {
  const payload = '<img src=x onerror="window.__miabXssSentinel=true"> reflected';
  await page.addInitScript(() => {
    window.__miabXssSentinel = false;
  });
  await login(page);
  expectConsoleError(page, "Failed to load resource: the server responded with a status of 400");
  await page.route("**/admin/mail/aliases/add", (route) =>
    route.fulfill({ status: 400, contentType: "text/plain", body: payload }),
  );
  await visitPanel(page, "aliases", "Aliases");
  await page.locator("#addaliasAddress").fill("unsafe@s5mail.lan");
  await page.locator("#addaliasForwardsTo").fill("me@s5mail.lan");
  await page.getByRole("button", { name: "Add Alias" }).click();
  const body = page.locator("#global_modal .modal-body");
  await expect(body).toContainText(payload);
  await expect(body.locator("img")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__miabXssSentinel)).toBe(false);
});
