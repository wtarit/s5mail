import { expect, login, openMobileNavigation, test } from "./fixtures.js";

test.beforeEach(async ({ page }) => login(page));

test("login exposes admin navigation and logout clears the session", async ({ page }) => {
  await openMobileNavigation(page);
  await expect(page.locator(".if-logged-in-admin").first()).toBeVisible();
  await page.getByRole("link", { name: "Log out" }).click();
  await expect(page.locator("#panel_login")).toBeVisible();
});

test("system dropdown opens and navigates", async ({ page }) => {
  await openMobileNavigation(page);
  const toggle = page.getByRole("link", { name: /^System/ });
  await toggle.click();
  await page.getByRole("link", { name: "Status Checks" }).click();
  await expect(page.locator("#panel_system_status")).toBeVisible();
});

test("mobile navbar toggles", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();
  await expect(page.locator(".navbar-collapse")).toHaveClass(/in/);
});
