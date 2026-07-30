import * as pdfjs from "../../vendor/pdfjs/pdf.min.mjs";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../../vendor/pdfjs/pdf.worker.min.mjs",
  import.meta.url,
).href;

interface PdfTextItem {
  hasEOL?: boolean;
  str?: string;
}

function pageText(textContent: { items: PdfTextItem[] }): string {
  const lines: string[] = [];
  let line = "";

  textContent.items.forEach((item) => {
    const value = item.str?.trim();
    if (value) line += `${line ? " " : ""}${value}`;
    if (item.hasEOL && line) {
      lines.push(line);
      line = "";
    }
  });
  if (line) lines.push(line);
  return lines.join("\n");
}

export async function extractPdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF 檔案請控制在 20 MB 以內。");
  }

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  let document: Awaited<typeof loadingTask.promise> | undefined;
  try {
    document = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageText(content).trim();
      if (text) pages.push(text);
      page.cleanup();
    }
    const result = pages.join("\n\n");
    if (!result) {
      throw new Error("這份 PDF 沒有可擷取的文字，可能是掃描圖片檔。");
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("沒有可擷取的文字")) throw error;
    throw new Error("無法讀取這份 PDF，檔案可能已損壞、加密或格式不受支援。");
  } finally {
    if (document) await document.destroy();
    else await loadingTask.destroy();
  }
}
