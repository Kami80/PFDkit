import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function exportDocument(page: Page, testInfo: TestInfo, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await pending;
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  return readFile(path, "utf8");
}

test("actual handle dragging rejects incompatible ports then creates a valid stream", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram" }).click();
  await page.getByRole("button", { name: "Add Feed", exact: true }).click();
  await page.getByRole("button", { name: "Add Pump", exact: true }).click();
  async function dragPort(sourceLabel: string, targetLabel: string) {
    const source = await page
      .getByLabel(sourceLabel, { exact: true })
      .boundingBox();
    const target = await page
      .getByLabel(targetLabel, { exact: true })
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
      { steps: 16 },
    );
    await page.mouse.up();
  }
  await dragPort("F-001 Material outlet (out)", "P-001 Shaft power (power)");
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await dragPort("F-001 Material outlet (out)", "P-001 Suction (in)");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});

test("construct, configure, connect, export, reopen and reject an invalid import", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByLabel("Document title")).toBeVisible();
  await page.getByRole("button", { name: "New diagram" }).click();
  await expect(page.getByText("A new process starts here")).toBeVisible();
  for (const name of ["Feed", "Pump", "Heat exchanger", "Product"])
    await page
      .getByRole("button", { name: `Add ${name}`, exact: true })
      .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByLabel("Document title").fill("Teaching process");
  await page.getByTestId("equipment-pump").click();
  await page.getByLabel("Efficiency (fraction)").fill("0.8");
  await page.getByLabel("Drive", { exact: true }).selectOption("steam");
  await page.getByTestId("equipment-heatExchanger").click();
  await page.getByLabel("Flow arrangement").selectOption("coCurrent");
  await page.getByLabel("Tube passes").fill("2");
  await page.getByLabel("Shell passes").focus();
  await page.getByText("Connect ports", { exact: true }).click();
  for (const [source, target] of [
    ["F-001 · Material outlet", "P-001 · Suction"],
    ["P-001 · Discharge", "E-001 · Tube inlet"],
    ["E-001 · Tube outlet", "PR-001 · Material inlet"],
  ]) {
    await page.getByLabel("Source outlet").selectOption({ label: source });
    await page.getByLabel("Target inlet").selectOption({ label: target });
    await page
      .getByRole("button", { name: "Connect stream", exact: true })
      .click();
  }
  await page.getByText("Connect ports", { exact: true }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await page
    .getByLabel("Temperature unit", { exact: true })
    .selectOption("degC");
  await page.getByLabel("Temperature", { exact: true }).fill("0");
  await page.getByLabel("Temperature unit", { exact: true }).focus();
  await page.getByLabel("Temperature unit", { exact: true }).selectOption("K");
  await expect(page.getByLabel("Temperature", { exact: true })).toHaveValue(
    "273.15",
  );
  const saved = await exportDocument(page, testInfo, "saved.json");
  const data = JSON.parse(saved);
  expect(
    data.engineering.equipment.find(
      (item: { type: string }) => item.type === "pump",
    ).config.efficiency,
  ).toBe(0.8);
  expect(
    data.engineering.equipment.find(
      (item: { type: string }) => item.type === "heatExchanger",
    ).config.tubePasses,
  ).toBe(2);
  await page.getByRole("button", { name: "New diagram" }).click();
  await page.getByLabel("Import process document").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(saved),
  });
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Teaching process",
  );
  expect(await exportDocument(page, testInfo, "reopened.json")).toBe(saved);
  data.engineering.streams[0].target.equipmentId = "nonexistent";
  await page.getByLabel("Import process document").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator(".canvas-status [role=status]")).toContainText(
    "Import rejected",
  );
  expect(await exportDocument(page, testInfo, "after-rejected.json")).toBe(
    saved,
  );
});

test("keyboard selection, rejected connection, integer editing and deletion preserve graph integrity", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const pump = page
    .locator(".react-flow__node")
    .filter({ has: page.getByTestId("equipment-pump") });
  await pump.focus();
  await pump.press("Enter");
  await expect(page.getByLabel("Equipment tag")).toHaveValue("P-101");
  await page.getByLabel("Equipment tag").fill("P-002");
  await page.getByLabel("Equipment tag").press("Backspace");
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByTestId("equipment-heatExchanger").click();
  await page.getByLabel("Tube passes").fill("1.5");
  await page.getByLabel("Shell passes").focus();
  await expect(page.getByLabel("Tube passes")).toHaveValue("2");
  await page.getByText("Connect ports", { exact: true }).click();
  await page
    .getByLabel("Source outlet")
    .selectOption({ label: "F-101 · Material outlet" });
  await page
    .getByLabel("Target inlet")
    .selectOption({ label: "P-00 · Shaft power" });
  await page
    .getByRole("button", { name: "Connect stream", exact: true })
    .click();
  await expect(page.locator(".canvas-status [role=status]")).toContainText(
    "energy",
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await page.getByText("Connect ports", { exact: true }).click();
  await page.getByTestId("equipment-pump").click();
  await page.getByRole("button", { name: "Delete equipment" }).click();
  const saved = JSON.parse(
    await exportDocument(page, testInfo, "deleted.json"),
  );
  expect(saved.engineering.equipment).toHaveLength(3);
  expect(saved.engineering.streams).toHaveLength(1);
});
