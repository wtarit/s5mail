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
  await toggle.focus();
  await toggle.press("ArrowDown");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const statusLink = page.getByRole("link", { name: "Status Checks" });
  await expect(statusLink).toBeFocused();
  await statusLink.press("Enter");
  await expect(page.locator("#panel_system_status")).toBeVisible();
});

test("mobile navbar toggles", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();
  await expect(page.locator(".navbar-collapse")).toHaveClass(/in/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("modal Escape restores focus and exposes ARIA state", async ({ page }) => {
  await page.evaluate(() => {
    window.location.hash = "users";
  });
  const trigger = page.getByRole("link", { name: "generate a random password" });
  await trigger.focus();
  await trigger.press("Enter");
  const modal = page.locator("#global_modal");
  await expect(modal).toBeVisible();
  await expect(modal).not.toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toBeFocused();
});
