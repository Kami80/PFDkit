import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.setTimeout(60000);

async function savedProjects(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("pfdkit:v1:project:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  );
}
async function exportJson(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

test("style, explorer edit/cancel, autosave and image export survive reopening", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByLabel("Document title").fill("M2 durable teaching figure");
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page.getByLabel("Style preset").selectOption("academicColorful");
  await page.getByRole("button", { name: "Close style", exact: true }).click();
  await page.getByTestId("equipment-heatExchanger").dblclick();
  const explorer = page.getByRole("dialog", {
    name: "Explore E-101",
    exact: true,
  });
  await expect(explorer).toBeVisible();
  await explorer.getByLabel("Explorer Tube passes").fill("1");
  await explorer.getByLabel("Explorer Tube passes").press("Enter");
  await explorer
    .getByLabel("Explorer Flow arrangement")
    .selectOption("coCurrent");
  await expect(
    explorer.locator('[data-circuit="tube"][data-pass]'),
  ).toHaveCount(1);
  const temperature = explorer.getByLabel("S-002 temperature", { exact: true });
  await temperature.fill("9007199254740992");
  await temperature.press("Enter");
  await expect(explorer.getByRole("alert")).toContainText(
    "portable numeric range",
  );
  await temperature.press("Escape");
  await expect(explorer).toBeVisible();
  await temperature.fill("273.15");
  await temperature.press("Enter");
  await explorer
    .getByLabel("S-002 temperature unit", { exact: true })
    .selectOption("K");
  // Fixture starts with degC, so changing the entered unit performs an offset conversion.
  await expect(temperature).toHaveValue("546.3");
  await temperature.fill("999");
  await temperature.press("Escape");
  await expect(explorer).toBeVisible();
  await expect(temperature).toHaveValue("546.3");
  await explorer
    .getByRole("button", { name: "Return to PFD", exact: true })
    .click();
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect
    .poll(async () => {
      const projects = await savedProjects(page);
      return projects.some(
        (project) => project.title === "M2 durable teaching figure",
      );
    })
    .toBe(true);
  await page.reload();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "M2 durable teaching figure",
  );
  const document = await exportJson(page);
  expect(document.presentation.metadata.style.preset).toBe("academicColorful");
  expect(
    document.engineering.equipment.find(
      (item: { id: string }) => item.id === "exchanger-1",
    ).config,
  ).toMatchObject({ tubePasses: 1, flowArrangement: "coCurrent" });
  await page
    .getByRole("button", { name: "Export figure", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Export figure",
    exact: true,
  });
  await dialog.getByLabel("Export format").selectOption("png");
  await dialog.getByLabel("Transparent background").check();
  await dialog.getByLabel("PNG width").fill("1200");
  await dialog.getByLabel("PNG height").fill("800");
  const pending = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download export", exact: true })
    .click();
  const image = await pending;
  await image.saveAs(testInfo.outputPath("teaching-transparent.png"));
  expect(
    (await readFile((await image.path())!)).subarray(1, 4).toString(),
  ).toBe("PNG");
  await dialog.getByLabel("Export format").selectOption("svg");
  const vectorPending = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download export", exact: true })
    .click();
  await (
    await vectorPending
  ).saveAs(testInfo.outputPath("teaching-transparent.svg"));
  await dialog.getByLabel("Export format").selectOption("png");
  await dialog.getByLabel("Transparent background").uncheck();
  const opaquePending = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download export", exact: true })
    .click();
  await (
    await opaquePending
  ).saveAs(testInfo.outputPath("teaching-opaque.png"));
  await dialog.getByLabel("PNG width").fill("9000");
  await dialog
    .getByRole("button", { name: "Download export", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("64–8192");
  await dialog
    .getByRole("button", { name: "Close Export figure", exact: true })
    .click();
  await page.getByTestId("equipment-heatExchanger").click();
  await page
    .getByRole("button", { name: "Export figure", exact: true })
    .click();
  await dialog.getByLabel("Export target").selectOption("selection");
  const downloadFigure = async (name: string) => {
    const pending = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download export", exact: true })
      .click();
    await (await pending).saveAs(testInfo.outputPath(name));
  };
  await downloadFigure("selection.svg");
  await dialog.getByLabel("Export format").selectOption("png");
  await dialog.getByLabel("PNG width").fill("1200");
  await dialog.getByLabel("PNG height").fill("1000");
  await downloadFigure("selection.png");
  await dialog
    .getByRole("button", { name: "Close Export figure", exact: true })
    .click();
  await page.getByTestId("equipment-heatExchanger").dblclick();
  await explorer.getByLabel("Explorer Tube passes").fill("2");
  await explorer.getByLabel("Explorer Tube passes").press("Enter");
  await explorer
    .getByLabel("Explorer Flow arrangement")
    .selectOption("counterCurrent");
  await expect(explorer.locator('[data-header-partition="left"]')).toHaveCount(
    1,
  );
  await explorer
    .getByRole("button", { name: "Export equipment detail", exact: true })
    .click();
  await downloadFigure("detail.svg");
  await dialog.getByLabel("Export format").selectOption("png");
  await dialog.getByLabel("PNG width").fill("1200");
  await dialog.getByLabel("PNG height").fill("1000");
  await downloadFigure("detail.png");
});

test("switching dirty projects flushes the previous project and persists the explicitly reopened project", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Document title").fill("Project A");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await page
    .getByRole("button", { name: "Local projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByLabel("Document title").fill("Project B");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await page.getByLabel("Document title").fill("Project B dirty edit");
  await page
    .getByRole("button", { name: "Reopen Project A", exact: true })
    .click();
  await expect(page.getByLabel("Document title")).toHaveValue("Project A");
  const projects = await savedProjects(page);
  expect(
    projects.some((project) => project.title === "Project B dirty edit"),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Document title")).toHaveValue("Project A");
});

test("a stale tab saves a recovery fork and deliberate deletion cannot resurrect a dirty project", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Document title").fill("Shared original");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect.poll(async () => (await savedProjects(page)).length).toBe(1);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByLabel("Document title")).toHaveValue(
    "Shared original",
  );
  await page.getByLabel("Document title").fill("Tab A revision");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await other.getByLabel("Document title").fill("Tab B revision");
  await other.getByRole("button", { name: "Save now", exact: true }).click();
  await expect
    .poll(async () =>
      (await savedProjects(page)).map((record) => record.title).sort(),
    )
    .toEqual(["Tab A revision", "Tab B revision (conflict recovery)"].sort());
  await other
    .getByRole("button", { name: "Local projects", exact: true })
    .click();
  await other
    .getByRole("button", {
      name: "Delete Tab B revision (conflict recovery)",
      exact: true,
    })
    .click();
  await other.getByLabel("Document title").fill("Unsaved final edit");
  const deletedId = (await savedProjects(page)).find((record) =>
    record.title.includes("Tab B"),
  )!.id;
  await other
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await other.waitForTimeout(1500);
  expect(
    (await savedProjects(page)).some((record) => record.id === deletedId),
  ).toBe(false);
});

test("storage rejection preserves work and displays a usable JSON fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await page.getByLabel("Document title").fill("Unsaved quota example");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(
    page.getByText(/Export JSON to keep your work/).first(),
  ).toBeVisible();
  expect((await exportJson(page)).title).toBe("Unsaved quota example");
});

test("multi-selection style edits commit numeric drafts and explicit theme wins system changes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByTestId("equipment-feed").click();
  await page.getByTestId("equipment-pump").click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await expect(page.getByText(/2 selected objects/)).toBeVisible();
  await page.getByLabel("Label size", { exact: true }).fill("24");
  await page.getByLabel("Label size", { exact: true }).press("Enter");
  await expect(page.getByLabel("Label size", { exact: true })).toHaveValue(
    "24",
  );
  await page.getByLabel("Line thickness", { exact: true }).fill("0.5");
  await page.getByLabel("Object line thickness", { exact: true }).fill("3.5");
  await page
    .getByLabel("Object line thickness", { exact: true })
    .press("Enter");
  await page.getByLabel("Interface appearance").selectOption("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("light");
  await page.getByRole("button", { name: "Close style", exact: true }).click();
  const document = await exportJson(page);
  expect(document.presentation.metadata.style).toMatchObject({
    fontSize: 24,
    lineWidth: 0.5,
  });
  expect(document.presentation.metadata.objectStyles["feed-1"].lineWidth).toBe(
    3.5,
  );
  expect(document.presentation.metadata.objectStyles["pump-1"].lineWidth).toBe(
    3.5,
  );
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("light");
});

test("a corrupt primary recovers a healthy snapshot and remote deletion preserves the open document", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page
    .getByLabel("Document title")
    .fill("Healthy snapshot teaching process");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect.poll(async () => (await savedProjects(page)).length).toBe(1);
  const original = (await savedProjects(page))[0];
  await page.evaluate(
    (id) => localStorage.setItem("pfdkit:v1:project:" + id, "{damaged}"),
    original.id,
  );
  await page.reload();
  await expect(
    page.getByText(/local project is damaged/).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Local projects", exact: true })
    .click();
  await page.getByText(/Recover autosave snapshots/).click();
  await page
    .getByRole("button", { name: "Recover snapshot", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Healthy snapshot teaching process copy",
  );
  const recovered = await exportJson(page);
  expect(recovered.id).not.toBe(original.id);
  expect(recovered.engineering.equipment).toHaveLength(4);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByLabel("Document title")).toHaveValue(
    "Healthy snapshot teaching process copy",
  );
  await other.evaluate(
    (id) => localStorage.removeItem("pfdkit:v1:project:" + id),
    recovered.id,
  );
  await expect(page.getByText(/deleted in another tab/).first()).toBeVisible();
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Healthy snapshot teaching process copy (conflict recovery)",
  );
  expect((await exportJson(page)).id).not.toBe(recovered.id);
});
