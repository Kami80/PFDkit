import { expect, test } from "@playwright/test";

test.skip(
  process.env.PFDKIT_PLATFORM_E2E !== "1",
  "Requires the local API/PostgreSQL stack.",
);
test.setTimeout(120000);

test("same-context editor tabs preserve separate recovery branches without guest-store forks", async ({
  page,
  context,
}) => {
  const username = `tabs_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
  await page.goto("/");
  const csrf = await page.request.get("/api/auth/csrf");
  const registration = await page.request.post("/api/auth/register", {
    headers: { "X-CSRFToken": (await csrf.json()).csrfToken },
    data: {
      username,
      email: `${username}@example.org`,
      password: "Robust-course-password!482",
    },
  });
  expect(registration.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "My projects", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Copy current document to account",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
  const project = (await (await page.request.get("/api/projects")).json())
    .items[0];
  const original = await (
    await page.request.get(`/api/projects/${project.id}`)
  ).json();
  const second = await context.newPage();
  await second.goto("/");
  await second
    .getByRole("button", { name: "My projects", exact: true })
    .click();
  await second
    .getByRole("button", { name: `Open ${project.title}`, exact: true })
    .click();
  await expect(second.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
  await context.route(
    `**/api/projects/${project.id}/document`,
    async (route) => {
      if (route.request().method() === "PUT")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "interrupted",
              message: "Connection interrupted; retry your save.",
            },
          }),
        });
      else await route.continue();
    },
  );
  const titles = [
    "First shared-storage branch",
    "Second shared-storage branch",
  ];
  await page.getByLabel("Document title", { exact: true }).fill(titles[0]);
  await expect(page.getByTestId("account-save-status")).toContainText(
    "interrupted",
  );
  await second.getByLabel("Document title", { exact: true }).fill(titles[1]);
  await expect(second.getByTestId("account-save-status")).toContainText(
    "interrupted",
  );
  const draftTitles = () =>
    page.evaluate(
      (projectId) =>
        Object.keys(localStorage)
          .filter((key) => key.includes(`:pending:${projectId}:`))
          .map((key) => JSON.parse(localStorage.getItem(key)!).document.title)
          .sort(),
      project.id,
    );
  expect(await draftTitles()).toEqual(titles);
  // Returning one tab to its acknowledged document must preserve the other tab's draft.
  await page
    .getByLabel("Document title", { exact: true })
    .fill(original.document.title);
  await expect(page.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
  expect(await draftTitles()).toEqual([titles[1]]);
  await page.getByLabel("Document title", { exact: true }).fill(titles[0]);
  await expect(page.getByTestId("account-save-status")).toContainText(
    "interrupted",
  );
  await page.reload();
  await page.getByRole("button", { name: "My projects", exact: true }).click();
  const recoveries = page.getByRole("button", {
    name: /^Recover browser draft \d+:/,
  });
  await expect(recoveries).toHaveCount(2);
  await recoveries.filter({ hasText: titles[0] }).click();
  await expect(page.getByTestId("account-save-status")).toContainText(
    "interrupted",
  );
  await context.unroute(`**/api/projects/${project.id}/document`);
  await page
    .getByRole("button", { name: "Save to account", exact: true })
    .click();
  await expect(page.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
  expect(await draftTitles()).toEqual([titles[1]]);
  const saved = await (
    await page.request.get(`/api/projects/${project.id}`)
  ).json();
  expect(saved.document.id).toBe(original.document.id);
  expect(saved.document.title).toBe(titles[0]);
  await second.close();
});
