import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, email = "student1@campusfix.test") {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-synthetic-password-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
}
test("student creates, reads, filters, paginates, restores session and logs out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page
    .getByRole("link", { name: "+ Report an issue", exact: true })
    .click();
  await page.getByLabel("Issue title").fill("Browser reported broken lamp");
  await page.getByLabel("Location", { exact: true }).fill("Browser lab");
  await page
    .getByLabel("What needs attention?")
    .fill("The desk lamp will not switch on.");
  const submitted = page.waitForResponse(
    (r) => r.url().endsWith("/api/requests") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Submit request" }).click();
  expect((await submitted).status()).toBe(201);
  await expect(
    page.getByRole("heading", { name: "Browser reported broken lamp" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Browser reported broken lamp" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to requests" }).click();
  await page.getByLabel("Exact location").fill("Browser lab");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByText("1 matching request", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to CampusFix" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("coordinator reads campus reports but cannot use student creation", async ({
  page,
}) => {
  await login(page, "coordinator@campusfix.test");
  await expect(
    page.getByRole("heading", { name: "Campus requests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+ Report an issue" }),
  ).toHaveCount(0);
  await page.goto("/#/new");
  await expect(
    page.getByRole("heading", { name: "Student access only" }),
  ).toBeVisible();
});
test("technician sees read-only available work and redacted detail", async ({
  page,
}) => {
  await login(page, "technician1@campusfix.test");
  await page.getByRole("link", { name: "Ceiling fan not turning" }).click();
  await expect(
    page.getByText("The description is not shared with your role."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /claim|assign|resolve/i }),
  ).toHaveCount(0);
});
test("lost session returns to sign-in on the next API call", async ({
  page,
  context,
}) => {
  await login(page);
  await context.clearCookies();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to CampusFix" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your session has expired. Please sign in again."),
  ).toBeVisible();
});
test("list error and empty state are recoverable", async ({ page }) => {
  await page.route("**/api/requests?*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR" } }),
    }),
  );
  await login(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/requests?*");
  await page.getByRole("button", { name: "Retry loading" }).click();
  await page.getByLabel("Exact location").fill("No such room");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No requests to show")).toBeVisible();
});
test("mobile form is keyboard accessible and does not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page
    .getByRole("link", { name: "+ Report an issue", exact: true })
    .click();
  await page.getByLabel("Issue title").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Location", { exact: true })).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
