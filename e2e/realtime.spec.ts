import { mkdir, writeFile } from "node:fs/promises";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-synthetic-password-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Connection: Live", { exact: true }),
  ).toBeVisible();
}
const accessibility: unknown[] = [];
async function confirm(page: Page, button: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Confirm change", exact: true }),
  ).toBeFocused();
  const modal = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(modal.violations).toEqual([]);
  accessibility.push({
    screen: button + " confirmation",
    violations: modal.violations.length,
    incomplete: modal.incomplete.map((r) => r.id),
  });
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
}
test("four authorized browser contexts synchronize and reconnect without manual refresh", async ({
  browser,
  baseURL,
}) => {
  const contexts: BrowserContext[] = [],
    pages: Page[] = [];
  try {
    for (const email of [
      "student1@campusfix.test",
      "coordinator@campusfix.test",
      "technician1@campusfix.test",
      "student2@campusfix.test",
    ]) {
      const c = await browser.newContext({ baseURL });
      contexts.push(c);
      const page = await c.newPage();
      pages.push(page);
      await login(page, email);
    }
    const [student, coordinator, technician, other] = pages as [
      Page,
      Page,
      Page,
      Page,
    ];
    await student
      .getByRole("link", { name: "+ Report an issue", exact: true })
      .click();
    await student.getByLabel("Issue title").fill("Live broken lamp");
    await student.getByLabel("Location", { exact: true }).fill("Live lab");
    await student
      .getByLabel("What needs attention?")
      .fill("Synthetic lamp requires maintenance.");
    await student.getByRole("button", { name: "Submit request" }).click();
    await expect(
      coordinator.getByRole("link", { name: "Live broken lamp" }),
    ).toBeVisible();
    await expect(
      other.getByRole("link", { name: "Live broken lamp" }),
    ).toHaveCount(0);
    const id = student.url().split("/requests/")[1]!;
    await coordinator.getByRole("link", { name: "Live broken lamp" }).click();
    await coordinator.getByRole("button", { name: "Triage request" }).click();
    await coordinator
      .getByLabel("Assign technician")
      .selectOption({ label: "Sam Demo" });
    await confirm(coordinator, "Assign request");
    await expect(
      technician.getByRole("link", { name: "Live broken lamp" }),
    ).toBeVisible();
    await expect(student.getByText("assign → in progress")).toBeVisible();
    await technician.getByRole("link", { name: "Live broken lamp" }).click();
    await technician
      .getByLabel("Resolution note", { exact: true })
      .fill("Replaced the bulb.");
    await technician.getByRole("button", { name: "Mark resolved" }).click();
    await expect(
      student.getByRole("button", { name: "Confirm and close" }),
    ).toBeVisible();
    await expect(coordinator.getByText("resolve → resolved")).toBeVisible();
    await student.getByRole("button", { name: /Notifications/ }).click();
    await expect(
      student.getByRole("region", { name: "Recent notifications" }),
    ).toContainText("resolve");
    // Disconnect the student's actual transport, update elsewhere, then let it reconnect.
    await contexts[0]!.setOffline(true);
    await expect(
      student.getByText("Connection: Offline", { exact: true }),
    ).toBeVisible();
    // Coordinator cannot reopen. The owner action is sent from a separate authenticated owner tab via REST.
    const ownerRequest = await contexts[0]!.request.get(`/api/auth/me`);
    expect(ownerRequest.status()).toBe(200);
    const session = await ownerRequest.json();
    const detail = await contexts[0]!.request.get(`/api/requests/${id}`);
    const row = (await detail.json()).request;
    const reopened = await contexts[0]!.request.post(
      `/api/requests/${id}/actions`,
      {
        headers: { Origin: baseURL!, "X-CSRF-Token": session.csrfToken },
        data: {
          action: "reopen",
          expectedVersion: row.version,
          note: "Still flickers.",
        },
      },
    );
    expect(reopened.status()).toBe(200);
    await expect
      .poll(() =>
        technician.getByRole("button", { name: "Mark resolved" }).count(),
      )
      .toBe(1);
    await expect(
      technician.getByRole("button", { name: "Mark resolved" }),
    ).toBeVisible();
    await contexts[0]!.setOffline(false);
    await expect(
      student.getByText("Connection: Live", { exact: true }),
    ).toBeVisible();
    await expect(student.getByText("reopen → in progress")).toBeVisible();
    await technician
      .getByLabel("Resolution note", { exact: true })
      .fill("Replaced connector.");
    await technician.getByRole("button", { name: "Mark resolved" }).click();
    await expect(
      student.getByRole("button", { name: "Confirm and close" }),
    ).toBeVisible();
    await confirm(student, "Confirm and close");
    await expect(coordinator.getByText("close → closed")).toBeVisible();
    await expect(student.getByText("This request is closed.")).toBeVisible();
    await expect(
      other.getByRole("button", { name: "Notifications (0)" }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test.describe.serial("responsive and accessible dashboard", () => {
  let context: BrowserContext, page: Page;
  test.beforeAll(async ({ browser, baseURL }) => {
    context = await browser.newContext({ baseURL });
    page = await context.newPage();
    await login(page, "student1@campusfix.test");
  });
  test.afterAll(async () => {
    await mkdir("docs/evidence", { recursive: true });
    await writeFile(
      "docs/evidence/m5-accessibility.json",
      JSON.stringify(
        { tool: "axe-core via Playwright", scans: accessibility },
        null,
        2,
      ) + "\n",
    );
    await context.close();
  });
  for (const width of [375, 768, 1024, 1440])
    test(`dashboard and forms at ${width}px have no overflow or axe violations`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "My requests" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("heading", { name: "Maintenance requests" }),
      ).toBeVisible();
      await mkdir("docs/screenshots", { recursive: true });
      await page.screenshot({
        path: `docs/screenshots/dashboard-${width}.png`,
        fullPage: true,
      });
      const dashboard = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(dashboard.violations).toEqual([]);
      accessibility.push({
        screen: "dashboard",
        width,
        violations: dashboard.violations.length,
        incomplete: dashboard.incomplete.map((r) => r.id),
      });
      await page
        .getByRole("link", { name: "+ Report an issue", exact: true })
        .click();
      await page.getByLabel("Issue title").focus();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Location", { exact: true })).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const form = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(form.violations).toEqual([]);
      accessibility.push({
        screen: "request form",
        width,
        violations: form.violations.length,
        incomplete: form.incomplete.map((r) => r.id),
      });
    });
  test("fresh cached list navigation avoids additional list HTTP calls", async ({
    browser,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Connection: Live", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Fixture request 12", exact: true }),
    ).toBeVisible();
    let calls = 0;
    const count = (r: import("@playwright/test").Request) => {
      if (new URL(r.url()).pathname === "/api/requests" && r.method() === "GET")
        calls++;
    };
    page.on("request", count);
    const timings: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await page
        .getByRole("link", { name: "Fixture request 12", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Fixture request 12", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to requests" }).click();
      await expect(
        page.getByRole("link", { name: "Fixture request 12", exact: true }),
      ).toBeVisible();
      timings.push(Date.now() - start);
    }
    page.off("request", count);
    expect(calls).toBe(0);
    await writeFile(
      "docs/evidence/m5-cache-navigation.json",
      JSON.stringify(
        {
          browser: browser.version(),
          runs: 3,
          listHTTPCallsDuringReturnNavigation: calls,
          roundTripDOMReadyMs: timings,
          limitations:
            "Synthetic local browser timings include automation overhead; no M4 runtime comparison or production speed claim.",
        },
        null,
        2,
      ) + "\n",
    );
  });
});
