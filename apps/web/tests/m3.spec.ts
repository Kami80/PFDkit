import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Document } from "../src/lib/contract";

async function lectureDocument(): Promise<Document> {
  const document = JSON.parse(
    await readFile(
      resolve(process.cwd(), "../../examples/valid-process.json"),
      "utf8",
    ),
  ) as Document;
  document.id = "m3-browser-lecture";
  document.title = "Nested heat recovery lecture";
  // The valid section ID 'root' exercises its independence from the editor's root context.
  document.engineering.sections = [
    {
      id: "root",
      name: "Heating unit",
      parentId: null,
      equipmentIds: ["pump-1"],
      boundaryPorts: [
        {
          id: "unit-in",
          streamId: "stream-1",
          internalEndpoint: { equipmentId: "pump-1", portId: "in" },
          direction: "in",
          kind: "material",
        },
        {
          id: "unit-out",
          streamId: "stream-3",
          internalEndpoint: { equipmentId: "exchanger-1", portId: "tubeOut" },
          direction: "out",
          kind: "material",
        },
      ],
    },
    {
      id: "exchanger-core",
      name: "Exchanger core",
      parentId: "root",
      equipmentIds: ["exchanger-1"],
      boundaryPorts: [
        {
          id: "core-in",
          streamId: "stream-2",
          internalEndpoint: { equipmentId: "exchanger-1", portId: "tubeIn" },
          direction: "in",
          kind: "material",
        },
        {
          id: "core-out",
          streamId: "stream-3",
          internalEndpoint: { equipmentId: "exchanger-1", portId: "tubeOut" },
          direction: "out",
          kind: "material",
        },
      ],
    },
  ];
  document.education.annotations = [
    {
      id: "lesson-callout",
      kind: "callout",
      text: "Entered illustration; outlet temperature remains unknown",
      targetId: "exchanger-1",
      x: 490,
      y: 110,
      endX: null,
      endY: null,
      visible: true,
      provenance: "illustrative",
    },
  ];
  document.education.steps = [
    {
      id: "lesson-overview",
      title: "Process overview",
      targetIds: [],
      revealIds: [],
      annotationIds: [],
      notes: "Introduce the feed and product.",
      explorerId: null,
    },
    {
      id: "lesson-section",
      title: "Connected heating section",
      targetIds: ["root"],
      revealIds: [],
      annotationIds: [],
      notes: "Boundary streams retain their original identities.",
      explorerId: null,
    },
    {
      id: "lesson-explorer",
      title: "Inspect the exchanger",
      targetIds: ["exchanger-core"],
      revealIds: [],
      annotationIds: ["lesson-callout"],
      notes: "Explain countercurrent segments without calculating duty.",
      explorerId: "exchanger-1",
    },
  ];
  return document;
}

async function importDocument(page: Page, document: Document) {
  await page.getByLabel("Import process document").setInputFiles({
    name: "lecture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.getByLabel("Document title")).toHaveValue(document.title);
}

async function nativeDocument(page: Page, info: TestInfo, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await pending;
  const path = info.outputPath(name);
  await download.saveAs(path);
  return readFile(path, "utf8");
}

test("nested lecture moves from PFD to section and read-only explorer, then restores editing exactly", async ({
  page,
}, info) => {
  await page.goto("/");
  await importDocument(page, await lectureDocument());
  const saved = await nativeDocument(page, info, "before-lecture.json");
  await page
    .getByRole("button", { name: "Teaching and sections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enter Exchanger core", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Process section breadcrumbs" }),
  ).toContainText("Heating unit");
  await expect(
    page.getByRole("navigation", { name: "Process section breadcrumbs" }),
  ).toContainText("Exchanger core");
  await page.getByRole("button", { name: "Present", exact: true }).click();
  const lecture = page.getByRole("dialog", {
    name: "Process presentation",
    exact: true,
  });
  await expect(
    lecture.getByRole("heading", { name: "Process overview" }),
  ).toBeVisible();
  await lecture
    .getByRole("button", { name: "Fullscreen", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.fullscreenElement?.getAttribute("aria-label") ?? null,
      ),
    )
    .toBe("Process presentation");
  await expect(
    lecture.getByLabel("Lecture notes", { exact: true }),
  ).toHaveCount(0);
  await lecture.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(
    lecture.getByRole("heading", { name: "Connected heating section" }),
  ).toBeVisible();
  await lecture.getByRole("button", { name: "Next step", exact: true }).click();
  await lecture
    .getByRole("button", { name: "Show notes", exact: true })
    .click();
  await expect(
    lecture.getByLabel("Lecture notes", { exact: true }),
  ).toContainText("without calculating duty");
  await lecture
    .getByRole("button", { name: "Inspect E-101", exact: true })
    .click();
  const explorer = page.getByRole("dialog", {
    name: "Explore E-101",
    exact: true,
  });
  await expect(
    explorer.getByText(
      "Presentation inspection: engineering values are read only.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    explorer.getByLabel("Explorer Tube passes", { exact: true }),
  ).toHaveCount(0);
  await explorer
    .getByRole("button", { name: "Return to PFD", exact: true })
    .click();
  await lecture
    .getByRole("button", { name: "Previous step", exact: true })
    .click();
  await expect(
    lecture.getByRole("heading", { name: "Connected heating section" }),
  ).toBeVisible();
  await lecture
    .getByRole("button", { name: "Exit presentation", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect(
    page.getByRole("navigation", { name: "Process section breadcrumbs" }),
  ).toContainText("Exchanger core");
  expect(await nativeDocument(page, info, "after-lecture.json")).toBe(saved);
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await importDocument(page, JSON.parse(saved) as Document);
  expect(await nativeDocument(page, info, "reopened-lecture.json")).toBe(saved);
});
