declare module "*pdf.min.mjs" {
  interface PdfTextItem {
    hasEOL?: boolean;
    str?: string;
  }

  interface PdfTextContent {
    items: PdfTextItem[];
  }

  interface PdfPage {
    cleanup(): void;
    getTextContent(): Promise<PdfTextContent>;
  }

  interface PdfDocument {
    destroy(): Promise<void>;
    getPage(pageNumber: number): Promise<PdfPage>;
    numPages: number;
  }

  interface PdfLoadingTask {
    destroy(): Promise<void>;
    promise: Promise<PdfDocument>;
  }

  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(options: { data: ArrayBuffer }): PdfLoadingTask;
}
