import { expect, test as base } from "@playwright/test";

export const email = process.env.S5MAIL_E2E_EMAIL;
export const password = process.env.S5MAIL_E2E_PASSWORD;

export async function login(page) {
  await page.goto("/admin/");
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPassword").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#panel_welcome")).toBeVisible();
}

export async function visitPanel(page, hash, heading) {
  await page.evaluate((panel) => {
    window.location.hash = panel;
  }, hash);
  await expect(page.locator(`#panel_${hash}`)).toBeVisible();
  await expect(
    page.locator(`#panel_${hash}`).getByRole("heading", { name: heading }).first(),
  ).toBeVisible();
}

export async function openMobileNavigation(page) {
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  if (await toggle.isVisible()) await toggle.click();
}

export function expectConsoleError(page, text) {
  page.__miabExpectedConsoleErrors.push(text);
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleErrors = [];
    const failedRequests = [];
    page.__miabExpectedConsoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });
    await use(page);
    if (consoleErrors.length || failedRequests.length) {
      await testInfo.attach("browser-errors", {
        body: [...consoleErrors, ...failedRequests].join("\n"),
        contentType: "text/plain",
      });
    }
    const unexpectedConsoleErrors = consoleErrors.filter(
      (error) => !page.__miabExpectedConsoleErrors.some((expected) => error.includes(expected)),
    );
    expect.soft(unexpectedConsoleErrors, "unexpected console errors").toEqual([]);
    expect.soft(failedRequests, "unexpected failed requests").toEqual([]);
  },
});

export { expect };
