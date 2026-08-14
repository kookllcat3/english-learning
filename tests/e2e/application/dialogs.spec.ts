import { expect, test } from "@playwright/test";

test("keeps a dialog open when a text-selection drag ends on the backdrop", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");

  await page.getByRole("button", { name: "新增教材" }).click();
  const dialog = page.getByRole("dialog", { name: "新增學習教材" });
  const titleInput = dialog.getByRole("textbox", { name: "教材名稱（選填）" });
  await titleInput.fill("A dialog title to select");

  const inputBox = await titleInput.boundingBox();
  if (!inputBox) throw new Error("The material title input has no bounding box.");

  await page.mouse.move(inputBox.x + inputBox.width - 8, inputBox.y + inputBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(4, 4, { steps: 4 });
  await page.mouse.up();

  await expect(dialog).toBeVisible();

  await page.mouse.click(4, 4);
  await expect(dialog).toBeHidden();
});


test("locks page scrolling behind a native dialog and restores the reading position", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => {
    document.body.style.minHeight = "2400px";
  });
  await expect.poll(() => page.evaluate(() => {
    window.scrollTo(0, 400);
    return window.scrollY;
  })).toBe(400);

  await page.getByRole("button", { name: "開啟資料管理" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "資料管理" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
  await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe("-400px");

  await page.mouse.move(2, 400);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe("-400px");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
});
