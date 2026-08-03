import { expect, test } from "@playwright/test";


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
