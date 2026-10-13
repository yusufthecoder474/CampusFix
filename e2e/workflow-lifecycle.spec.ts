import { test, expect, type BrowserContext, type Page } from "@playwright/test";
// A serial multi-role journey: each step verifies the state committed by the previous role.
test.describe.serial("maintenance lifecycle", () => {
  let contexts: BrowserContext[] = [],
    student: Page,
    coordinator: Page,
    technician: Page,
    outsider: Page,
    id: string;
  test.beforeAll(async ({ browser, baseURL }) => {
    for (const email of [
      "student1@campusfix.test",
      "coordinator@campusfix.test",
      "technician1@campusfix.test",
      "technician2@campusfix.test",
    ]) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const page = await context.newPage();
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
    [student, coordinator, technician, outsider] = contexts.map(
      (c) => c.pages()[0]!,
    ) as [Page, Page, Page, Page];
  });
  test.afterAll(async () => {
    await Promise.all(contexts.map((c) => c.close()));
    contexts = [];
  });
  test("coordinator triages and assigns; stale tab refreshes and other technician loses access", async () => {
    await student
      .getByRole("link", { name: "+ Report an issue", exact: true })
      .click();
    await student.getByLabel("Issue title").fill("Lifecycle broken light");
    await student.getByLabel("Location", { exact: true }).fill("Lifecycle lab");
    await student
      .getByLabel("What needs attention?")
      .fill("Synthetic light requires repair.");
    await student.getByRole("button", { name: "Submit request" }).click();
    await expect(
      student.getByRole("heading", { name: "Lifecycle broken light" }),
    ).toBeVisible();
    id = student.url().split("/requests/")[1]!;
    await coordinator.goto(`/#/requests/${id}`);
    await coordinator.getByRole("button", { name: "Triage request" }).click();
    await expect(coordinator.getByLabel("Assign technician")).toBeVisible();
    await outsider.goto(`/#/requests/${id}`);
    await expect(
      outsider.getByRole("heading", { name: "Lifecycle broken light" }),
    ).toBeVisible();
    await expect(
      outsider.getByRole("button", { name: "Assign request" }),
    ).toHaveCount(0);
    const stale = await contexts[1]!.newPage();
    await stale.routeWebSocket("**/socket.io/**", (ws) => ws.close());
    await stale.goto(`/#/requests/${id}`);
    await stale
      .getByLabel("Assign technician")
      .selectOption({ label: "Lee Demo" });
    await coordinator
      .getByLabel("Assign technician")
      .selectOption({ label: "Sam Demo" });
    await coordinator.getByRole("button", { name: "Assign request" }).click();
    await coordinator.getByRole("button", { name: "Confirm change" }).click();
    await expect(coordinator.getByText("assign → in progress")).toBeVisible();
    await stale.getByRole("button", { name: "Assign request" }).click();
    await stale.getByRole("button", { name: "Confirm change" }).click();
    await expect(stale.getByText(/changed in another session/)).toBeVisible();
    await expect(
      stale.getByRole("button", { name: "Assign request" }),
    ).toHaveCount(0);
    await stale.close();
    await outsider.reload();
    await expect(outsider.getByRole("alert")).toContainText(
      "not available to your account",
    );
  });
  test("assigned technician filters assigned work and resolves with an audit note", async () => {
    await technician.goto("/");
    await technician
      .getByLabel("Status", { exact: true })
      .selectOption("in_progress");
    await technician.getByLabel("Exact location").fill("Lifecycle lab");
    await technician.getByRole("button", { name: "Apply filters" }).click();
    await technician
      .getByRole("link", { name: "Lifecycle broken light" })
      .click();
    await technician
      .getByLabel("Resolution note", { exact: true })
      .fill("Replaced the lamp.");
    await technician.getByRole("button", { name: "Mark resolved" }).click();
    await expect(technician.getByText("resolve → resolved")).toBeVisible();
    await expect(
      technician.getByRole("button", { name: "Mark resolved" }),
    ).toHaveCount(0);
  });
  test("student tracks progress and reopens; technician resolves again", async () => {
    await student.getByRole("button", { name: "Refresh progress" }).click();
    await expect(student.getByText("resolve → resolved")).toBeVisible();
    await student
      .getByLabel("Reason for reopening")
      .fill("Light still flickers.");
    await student.getByRole("button", { name: "Reopen request" }).click();
    await expect(student.getByText("reopen → in progress")).toBeVisible();
    await technician.getByRole("button", { name: "Refresh progress" }).click();
    await technician
      .getByLabel("Resolution note", { exact: true })
      .fill("Replaced wiring connector.");
    await technician.getByRole("button", { name: "Mark resolved" }).click();
    await expect(
      technician.getByText("Replaced wiring connector.").first(),
    ).toBeVisible();
  });
  test("student confirms closure and paginates persisted progress history", async () => {
    await student.getByRole("button", { name: "Refresh progress" }).click();
    await student.getByRole("button", { name: "Confirm and close" }).click();
    await student.getByRole("button", { name: "Confirm change" }).click();
    await expect(student.getByText("This request is closed.")).toBeVisible();
    await expect(student.getByText("close → closed")).toBeVisible();
    await student.getByRole("button", { name: "Older events" }).click();
    await expect(student.getByText("create → reported")).toBeVisible();
    await student.reload();
    await expect(student.getByText("This request is closed.")).toBeVisible();
    await expect(
      student.getByRole("button", { name: "Reopen request" }),
    ).toHaveCount(0);
  });
});
