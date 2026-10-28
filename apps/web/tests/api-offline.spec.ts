import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("guest editing, local reopening and JSON export work with every API request unavailable", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Heat exchanger", exact: true })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Offline guest lesson");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
    "Offline guest lesson",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await pending;
  const document = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(document.title).toBe("Offline guest lesson");
  expect(document.engineering.equipment[0].type).toBe("heatExchanger");
});
