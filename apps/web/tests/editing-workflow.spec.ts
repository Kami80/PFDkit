import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("all ten palette definitions can be configured, saved and reopened", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const changes: Record<string, [string, string]> = {
    Pump: ["Drive", "steam"],
    "Heat exchanger": ["Flow Arrangement", "coCurrent"],
    Separator: ["Orientation", "horizontal"],
    Tank: ["Orientation", "horizontal"],
    Mixer: ["Mixing Method", "agitated"],
    Column: ["Internals", "packing"],
    Reactor: ["Reactor Type", "plugFlow"],
  };
  for (const name of [
    "Feed",
    "Pump",
    "Heat exchanger",
    "Product",
    "Separator",
    "Tank",
    "Mixer",
    "Splitter",
    "Column",
    "Reactor",
  ]) {
    await page.getByLabel("Find equipment").fill(name);
    await page
      .getByRole("button", { name: `Add ${name}`, exact: true })
      .focus();
    await page
      .getByRole("button", { name: `Add ${name}`, exact: true })
      .press("Enter");
    if (changes[name]) {
      const [label, value] = changes[name];
      await page.getByLabel(label, { exact: true }).selectOption(value);
    }
  }
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  const before = await saved(page, info, "ten-catalog");
  expect(
    new Set(
      before.engineering.equipment.map((item: { type: string }) => item.type),
    ).size,
  ).toBe(10);
  await page.getByLabel("Import process document").setInputFiles({
    name: "catalog.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(before)),
  });
  expect(await saved(page, info, "ten-reopened")).toEqual(before);
});

test("Shift region selection, keyboard group movement and canvas panning preserve document semantics", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".flow-container")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const feed = await page.getByTestId("equipment-feed").boundingBox();
  const pump = await page.getByTestId("equipment-pump").boundingBox();
  const pane = await page.locator(".flow-container").boundingBox();
  expect(feed).not.toBeNull();
  expect(pump).not.toBeNull();
  expect(pane).not.toBeNull();
  await page.keyboard.down("Shift");
  // A fitted diagram can place its first node against the canvas edge. Begin
  // the real selection gesture on its pane, rather than over the equipment palette.
  await page.mouse.move(
    Math.max(pane!.x + 2, feed!.x - 5),
    Math.max(pane!.y + 2, feed!.y - 8),
  );
  await page.mouse.down();
  await page.mouse.move(pump!.x + pump!.width + 5, pump!.y + pump!.height + 8, {
    steps: 15,
  });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  const before = await saved(page, info, "before-keymove");
  const node = page.locator('.react-flow__node[data-id="pump-1"]');
  await node.focus();
  await node.press("ArrowRight");
  const after = await saved(page, info, "after-keymove");
  expect(after.presentation.nodes["pump-1"].x).toBe(
    before.presentation.nodes["pump-1"].x + 20,
  );
  expect(after.presentation.nodes["feed-1"].x).toBe(
    before.presentation.nodes["feed-1"].x + 20,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await saved(page, info, "undo-keymove")).toEqual(before);
  const canvas = await page.locator(".flow-container").boundingBox();
  const prior = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  await page.mouse.move(
    canvas!.x + canvas!.width / 2,
    canvas!.y + canvas!.height - 50,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas!.x + canvas!.width / 2 + 45,
    canvas!.y + canvas!.height - 70,
    { steps: 12 },
  );
  await page.mouse.up();
  expect(
    await page.locator(".react-flow__viewport").getAttribute("style"),
  ).not.toBe(prior);
  expect((await saved(page, info, "after-pan")).engineering).toEqual(
    before.engineering,
  );
});

async function saved(page: Page, info: TestInfo, name: string) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await waiting;
  const file = info.outputPath(`${name}.json`);
  await download.saveAs(file);
  return JSON.parse(await readFile(file, "utf8"));
}

test("search, category, keyboard placement and property commit/cancel use coherent history", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Equipment category").selectOption("Separation");
  await page.getByLabel("Find equipment").fill("flash");
  const add = page.getByRole("button", { name: "Add Separator", exact: true });
  await expect(add).toBeVisible();
  await add.focus();
  await add.press("Enter");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page
    .getByLabel("Orientation", { exact: true })
    .selectOption("horizontal");
  await page.getByLabel("Equipment tag").focus();
  await page.getByLabel("Equipment tag").fill("V-A LONG EDITED LABEL");
  await page.getByLabel("Equipment tag").press("Escape");
  await expect(page.getByLabel("Equipment tag")).toHaveValue("V-001");
  let document = await saved(page, info, "configured");
  expect(document.engineering.equipment.at(-1).config.orientation).toBe(
    "horizontal",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  document = await saved(page, info, "undo-config");
  expect(document.engineering.equipment.at(-1).config.orientation).toBe(
    "vertical",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.getByLabel("Find equipment").fill("impossible-match");
  await expect(
    page.getByText("No equipment matches.", { exact: false }),
  ).toBeVisible();
});

test("native multiple selection, group movement, copy/paste and delete are reversible", async ({
  page,
}, info) => {
  await page.goto("/");
  // Use the visible tag when fit-to-view places the first symbol beside the
  // floating zoom controls; the symbol's center can be covered by that toolbar.
  await page.getByTestId("equipment-feed").locator(".equipment-tag").click();
  await page.getByTestId("equipment-pump").click({ modifiers: ["Control"] });
  await expect(
    page.getByRole("heading", { name: "2 objects selected" }),
  ).toBeVisible();
  const before = await saved(page, info, "before-group");
  const box = await page.getByTestId("equipment-pump").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 70,
    box!.y + box!.height / 2 + 45,
    { steps: 12 },
  );
  await page.mouse.up();
  const moved = await saved(page, info, "moved-group");
  expect(moved.engineering).toEqual(before.engineering);
  const dx =
    moved.presentation.nodes["pump-1"].x -
    before.presentation.nodes["pump-1"].x;
  const dy =
    moved.presentation.nodes["pump-1"].y -
    before.presentation.nodes["pump-1"].y;
  expect(dx !== 0 || dy !== 0).toBe(true);
  expect(
    moved.presentation.nodes["feed-1"].x -
      before.presentation.nodes["feed-1"].x,
  ).toBe(dx);
  expect(
    moved.presentation.nodes["feed-1"].y -
      before.presentation.nodes["feed-1"].y,
  ).toBe(dy);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await saved(page, info, "undo-group")).toEqual(before);
  await page
    .getByRole("button", { name: "Copy selection", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Paste selection", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  const pasted = await saved(page, info, "pasted");
  const stream = pasted.engineering.streams.at(-1);
  expect(stream.source.equipmentId).not.toBe("feed-1");
  expect(stream.target.equipmentId).not.toBe("pump-1");
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await saved(page, info, "undo-delete")).toEqual(pasted);
});

test("actual edge reconnection retains stream identity and operating values", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Find equipment").fill("pump");
  await page.getByRole("button", { name: "Add Pump", exact: true }).click();
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const before = await saved(page, info, "before-reconnect");
  const original = before.engineering.streams[0];
  const pump = before.engineering.equipment.at(-1);
  const edge = page.locator('.react-flow__edge[data-id="stream-1"]');
  await edge.focus();
  await edge.press("Enter");
  const source = await edge
    .locator(".react-flow__edgeupdater-target")
    .boundingBox();
  const target = await page
    .getByLabel(`${pump.tag} Suction (in)`, { exact: true })
    .boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 18 },
  );
  await page.mouse.up();
  const changed = await saved(page, info, "reconnected");
  expect(changed.engineering.streams[0]).toEqual({
    ...original,
    target: { equipmentId: pump.id, portId: "in" },
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    (await saved(page, info, "undo-reconnect")).engineering.streams[0],
  ).toEqual(original);
});
