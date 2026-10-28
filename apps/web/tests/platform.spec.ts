import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { readFile } from "node:fs/promises";

// Requires the isolated migrated API/PostgreSQL stack. Ordinary guest checks stay server independent.
test.skip(
  process.env.PFDKIT_PLATFORM_E2E !== "1",
  "Set PFDKIT_PLATFORM_E2E=1 with the local platform stack running.",
);
test.setTimeout(150000);

async function mutate(
  request: APIRequestContext,
  path: string,
  method: string,
  data: unknown = {},
) {
  const csrf = await request.get("/api/auth/csrf");
  expect(csrf.ok()).toBeTruthy();
  return request.fetch(`/api${path}`, {
    method,
    headers: { "X-CSRFToken": (await csrf.json()).csrfToken },
    data,
  });
}
async function register(page: Page) {
  const username = `student_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in / register", exact: true })
    .click();
  const account = page.getByRole("dialog", { name: "Account", exact: true });
  await account.getByRole("button", { name: "Register", exact: true }).click();
  await account.getByLabel("Username", { exact: true }).fill(username);
  await account
    .getByLabel("Email", { exact: true })
    .fill(`${username}@example.org`);
  await account
    .getByLabel("Password", { exact: true })
    .fill("Robust-course-password!482");
  await account
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "My projects", exact: true }),
  ).toBeVisible();
  return { username, password: "Robust-course-password!482" };
}
async function copyGuest(page: Page) {
  await page
    .getByRole("dialog", { name: "My projects" })
    .getByRole("button", {
      name: "Copy current document to account",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog", { name: "My projects" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
  return (await (await page.request.get("/api/projects")).json()).items[0] as {
    id: string;
    title: string;
    currentRevision: number;
  };
}
async function openProject(page: Page, title: string) {
  await page.getByRole("button", { name: "My projects", exact: true }).click();
  await page
    .getByRole("dialog", { name: "My projects" })
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(page.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
}

test("account copies, autosave, reopen, restore, recovery and concurrent edits", async ({
  page,
  browser,
}) => {
  await register(page);
  const owned = await copyGuest(page);
  const original = await (
    await page.request.get(`/api/projects/${owned.id}`)
  ).json();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Saved teaching process");
  await expect(page.getByTestId("account-save-status")).toContainText(
    "revision 2",
  );
  const saved = await (
    await page.request.get(`/api/projects/${owned.id}`)
  ).json();
  expect(saved.document.title).toBe("Saved teaching process");
  expect(saved.document.id).not.toBe("example-process");

  await page.reload();
  await openProject(page, owned.title);
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
    "Saved teaching process",
  );
  await page
    .getByRole("button", { name: "Revision history", exact: true })
    .click();
  const history = page.getByRole("dialog", {
    name: "Revision history",
    exact: true,
  });
  await history
    .getByRole("button", { name: "Inspect revision 1", exact: true })
    .click();
  await expect(
    history.getByRole("heading", { name: "Read-only revision 1" }),
  ).toBeVisible();
  await history
    .getByRole("button", {
      name: "Restore revision 1 as new revision",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("account-save-status")).toContainText(
    "revision 3",
  );
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
    original.document.title,
  );

  let fail = true;
  await page.route(`**/api/projects/${owned.id}/document`, async (route) => {
    if (route.request().method() === "PUT" && fail) {
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
    } else await route.continue();
  });
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Interrupted edits survive");
  await expect(page.getByTestId("account-save-status")).toContainText(
    "interrupted",
  );
  const pending = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.includes(":pending:"))
      .map((k) => JSON.parse(localStorage.getItem(k)!)),
  );
  expect(
    pending.some((p) => p.document.title === "Interrupted edits survive"),
  ).toBeTruthy();
  fail = false;
  await page.reload();
  await page.getByRole("button", { name: "My projects", exact: true }).click();
  const dashboard = page.getByRole("dialog", { name: "My projects" });
  await dashboard
    .getByRole("button", { name: "Recover browser draft", exact: true })
    .click();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
    "Interrupted edits survive",
  );
  await expect(page.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );

  const session = await page.context().storageState();
  const secondContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    storageState: { cookies: session.cookies, origins: [] },
  });
  const second = await secondContext.newPage();
  await second.goto("/");
  await openProject(second, owned.title);
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Newer first-tab revision");
  await expect(page.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
  await second
    .getByLabel("Document title", { exact: true })
    .fill("My competing tab edits");
  await expect(second.getByTestId("account-save-status")).toContainText(
    "newer revision",
    { ignoreCase: true },
  );
  await expect(
    second.getByLabel("Document title", { exact: true }),
  ).toHaveValue("My competing tab edits");
  const before = (await (await page.request.get("/api/projects")).json()).total;
  await second
    .getByRole("button", {
      name: "Keep edits as a new private copy",
      exact: true,
    })
    .click();
  await expect(second.getByTestId("account-save-status")).toContainText(
    "Saved to account",
  );
  expect((await (await page.request.get("/api/projects")).json()).total).toBe(
    before + 1,
  );
  expect(
    (await (await page.request.get(`/api/projects/${owned.id}`)).json())
      .document.title,
  ).toBe("Newer first-tab revision");
  await secondContext.close();
});

test("deliberate pinned publication, anonymous reader, attributed reuse, withdrawal and privacy", async ({
  page,
  browser,
}) => {
  await register(page);
  const owned = await copyGuest(page);
  const initial = await (
    await page.request.get(`/api/projects/${owned.id}`)
  ).json();
  expect(initial.visibility).toBe("private");
  expect(initial.publication).toBeNull();
  await page
    .getByRole("button", { name: "Publish / sharing", exact: true })
    .click();
  const publish = page.getByRole("dialog", {
    name: "Publish and sharing",
    exact: true,
  });
  const title = `Academic exchanger ${Date.now()}`;
  await publish.getByLabel("Public title", { exact: true }).fill(title);
  await publish
    .getByLabel("Public description", { exact: true })
    .fill(
      '<img src=x onerror="window.publicXss=1"> A reviewed academic example.',
    );
  await publish
    .getByLabel("Author attribution", { exact: true })
    .fill("Course contributor");
  await publish
    .getByRole("combobox", { name: "Content license", exact: true })
    .selectOption("CC-BY-4.0");
  await publish
    .getByLabel("Process category", { exact: true })
    .fill("Heat transfer");
  await publish
    .getByLabel("Equipment tags (comma separated)", { exact: true })
    .fill("exchanger, pump");
  await publish
    .getByLabel("Offer this diagram as an educational template", {
      exact: false,
    })
    .check();
  await publish
    .getByRole("button", { name: "Confirm publish revision 1", exact: true })
    .click();
  expect(
    (await (await page.request.get(`/api/projects/${owned.id}`)).json())
      .publication,
  ).toBeNull();
  await publish.getByLabel("I have the rights", { exact: false }).check();
  await publish
    .getByRole("button", { name: "Confirm publish revision 1", exact: true })
    .click();
  await expect(
    publish.getByRole("link", { name: "Open public diagram / share link" }),
  ).toBeVisible();
  const detail = await (
      await page.request.get(`/api/projects/${owned.id}`)
    ).json(),
    publicationId = detail.publication.id;
  await publish
    .getByRole("button", { name: "Close Publish and sharing", exact: true })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Private edits after publication");
  await expect(page.getByTestId("account-save-status")).toContainText(
    "revision 2",
  );

  const readerContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    }),
    reader = await readerContext.newPage();
  expect((await reader.request.get(`/api/projects/${owned.id}`)).status()).toBe(
    401,
  );
  await reader.goto("/library");
  await reader
    .getByLabel("Search public diagrams", { exact: true })
    .fill(title);
  await reader.getByRole("link", { name: title, exact: true }).click();
  await expect(
    reader.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    reader.getByText("published revision 1", { exact: false }),
  ).toBeVisible();
  await expect(
    reader.getByRole("img", { name: title, exact: true }),
  ).toBeVisible();
  expect(await reader.evaluate(() => "publicXss" in window)).toBe(false);
  await expect(
    reader.getByLabel("Document title", { exact: true }),
  ).toHaveCount(0);
  const downloadPromise = reader.waitForEvent("download");
  await reader
    .getByRole("button", { name: "Download SVG", exact: true })
    .click();
  const download = await downloadPromise,
    path = await download.path();
  expect(await readFile(path!, "utf8")).toContain("Course contributor");
  await reader
    .getByRole("button", { name: /^Explore / })
    .first()
    .click();
  await expect(reader.getByRole("dialog", { name: /^Explore / })).toBeVisible();
  await expect(reader.getByLabel(/^Explorer /)).toHaveCount(0);
  await reader
    .getByRole("button", { name: "Return to PFD", exact: true })
    .click();

  await register(reader); // An unrelated contributor gets their own private attributed copy.
  expect((await reader.request.get(`/api/projects/${owned.id}`)).status()).toBe(
    404,
  );
  await reader
    .getByRole("button", { name: "Close My projects", exact: true })
    .click();
  await reader.goto(`/library/${publicationId}`);
  await reader
    .getByRole("button", {
      name: "Use template as private account copy",
      exact: true,
    })
    .click();
  await expect(
    reader.getByText("Private copy created:", { exact: false }),
  ).toBeVisible();
  const copies = (await (await reader.request.get("/api/projects")).json())
    .items;
  const reused = await (
    await reader.request.get(`/api/projects/${copies[0].id}`)
  ).json();
  expect(reused.visibility).toBe("private");
  expect(reused.document.metadata.attribution.creator).toBe(
    "Course contributor",
  );
  expect(reused.document.metadata.attribution.license).toBe("CC-BY-4.0");
  expect(
    (
      await mutate(reader.request, `/projects/${owned.id}/publish`, "DELETE")
    ).status(),
  ).toBe(404);
  await reader
    .getByText("Report unsuitable content or a licensing issue", {
      exact: true,
    })
    .click();
  await reader
    .getByLabel("Issue for maintainers", { exact: true })
    .fill("Example issue for local maintainer workflow verification.");
  await reader
    .getByRole("button", { name: "Submit content report", exact: true })
    .click();
  await expect(
    reader.getByText("Report received for maintainer review.", {
      exact: false,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Publish / sharing", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Publish and sharing" })
    .getByRole("button", { name: "Unpublish diagram", exact: true })
    .click();
  await expect(
    page.getByText("Unpublished. The public link is no longer accessible.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await reader.request.get(`/api/library/${publicationId}`)).status(),
  ).toBe(404);
  expect(
    (
      await reader.request.get(`/api/library/${publicationId}/document`)
    ).status(),
  ).toBe(404);
  expect(
    (await reader.request.get(`/api/projects/${copies[0].id}`)).status(),
  ).toBe(200);
  await readerContext.close();
});
