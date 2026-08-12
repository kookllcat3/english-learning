import { expect, test } from "@playwright/test";

import { databaseSnapshot } from "./data-integrity-helpers";

async function openAddMaterialDialog(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增教材" }).click();
}

test("creates a pasted material with an exact relational database shape", async ({ page }) => {
  const content = "Bear bear BEAR.\n熊。";
  await openAddMaterialDialog(page);
  await page.getByLabel("教材名稱（選填）").fill("貼上資料完整性");
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存教材" }).click();
  await expect(page.getByRole("heading", { name: "貼上資料完整性" })).toBeVisible();

  const snapshot = await databaseSnapshot(page);
  expect(snapshot.version).toBe(9);
  expect(snapshot.stores.materials).toHaveLength(1);
  const material = snapshot.stores.materials[0] as Record<string, unknown>;
  expect(material).toMatchObject({
    description: "",
    knownCount: 0,
    knownWords: [],
    title: "貼上資料完整性",
    wordCount: 1,
  });
  expect(typeof material.id).toBe("string");
  expect(Date.parse(String(material.createdAt))).not.toBeNaN();
  expect(material.updatedAt).toBe(material.createdAt);
  expect(snapshot.stores.materialContents).toEqual([{
    content,
    contentBlocks: [{ order: 0, text: content, type: "text" }],
    materialId: material.id,
  }]);
  expect(snapshot.stores.materialTerms).toEqual([{ materialId: material.id, words: ["bear"] }]);
  expect(snapshot.stores.materialAssets).toEqual([]);
  expect(snapshot.stores.materialAnnotations).toEqual([]);
  expect(snapshot.stores.vocabulary).toEqual([]);
  expect(snapshot.stores.wordNotes).toEqual([]);
  expect(snapshot.stores.settings).toEqual([]);
});

test("creates a UTF-8 TXT material with exact content and indexes", async ({ page }) => {
  const content = "Fox jumps.\r\n狐狸跳。";
  await openAddMaterialDialog(page);
  await page.getByLabel("選擇 TXT 檔案").setInputFiles({
    name: "utf8-lesson.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf8"),
  });
  await page.getByRole("button", { name: "儲存教材" }).click();
  await expect(page.getByRole("heading", { name: "utf8-lesson" })).toBeVisible();

  const snapshot = await databaseSnapshot(page);
  const material = snapshot.stores.materials[0] as Record<string, unknown>;
  expect(material).toMatchObject({ title: "utf8-lesson", wordCount: 2 });
  expect(snapshot.stores.materialContents).toEqual([{
    content,
    contentBlocks: [{ order: 0, text: content, type: "text" }],
    materialId: material.id,
  }]);
  expect(snapshot.stores.materialTerms).toEqual([{
    materialId: material.id,
    words: ["fox", "jumps"],
  }]);
});

const rejectedMaterialFiles = [
  {
    label: "unsupported format",
    expectedError: "目前只支援 UTF-8 TXT 檔案或直接貼上文字",
    file: {
      name: "lesson.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("not a supported document", "utf8"),
    },
  },
  {
    label: "oversized TXT",
    expectedError: "TXT 檔案請控制在 2 MB 以內",
    file: {
      name: "oversized.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 0x61),
    },
  },
  {
    label: "malformed UTF-8",
    expectedError: "TXT 檔案必須使用有效的 UTF-8 編碼",
    file: {
      name: "malformed.txt",
      mimeType: "text/plain",
      buffer: Buffer.from([0xc3, 0x28]),
    },
  },
] as const;

for (const rejected of rejectedMaterialFiles) {
  test(`rejects ${rejected.label} without writing any material store`, async ({ page }) => {
    await openAddMaterialDialog(page);
    const before = await databaseSnapshot(page);
    await page.getByLabel("選擇 TXT 檔案").setInputFiles(rejected.file);
    await page.getByRole("button", { name: "儲存教材" }).click();
    await expect(page.getByRole("dialog", { name: "新增學習教材" }).getByRole("alert"))
      .toContainText(rejected.expectedError);
    expect(await databaseSnapshot(page)).toEqual(before);
  });
}

test("rejects an empty material without writing any material store", async ({ page }) => {
  await openAddMaterialDialog(page);
  const before = await databaseSnapshot(page);
  await page.getByRole("button", { name: "儲存教材" }).click();
  await expect(page.getByRole("dialog", { name: "新增學習教材" }).getByRole("alert"))
    .toContainText("請選擇 TXT，或直接貼上教材內容");
  expect(await databaseSnapshot(page)).toEqual(before);
});

test("rolls back every material store when creation persistence fails", async ({ page }) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value: unknown, key?: IDBValidKey) {
      if (
        sessionStorage.getItem("failMaterialCreation") === "true"
        && this.name === "materialContents"
      ) {
        throw new DOMException("Synthetic material creation failure", "QuotaExceededError");
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });
  await openAddMaterialDialog(page);
  const before = await databaseSnapshot(page);
  await page.evaluate(() => sessionStorage.setItem("failMaterialCreation", "true"));
  await page.getByLabel("教材名稱（選填）").fill("不應留下的教材");
  await page.getByLabel("直接貼上文字").fill("Bear remains atomic.");
  await page.getByRole("button", { name: "儲存教材" }).click();
  await expect(page.getByRole("dialog", { name: "新增學習教材" }).getByRole("alert"))
    .toContainText("教材儲存失敗，未寫入任何資料");
  expect(await databaseSnapshot(page)).toEqual(before);
});
