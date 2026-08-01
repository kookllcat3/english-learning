declare module "*jszip.min.js";

interface JsZipFile {
  _data?: {
    compressedSize?: number;
    uncompressedSize?: number;
  };
  dir: boolean;
  async(type: "blob"): Promise<Blob>;
  async(type: "text"): Promise<string>;
  async(type: "uint8array"): Promise<Uint8Array>;
  internalStream(type: "uint8array"): JsZipStreamHelper;
}

interface JsZipStreamHelper {
  on(event: "data", callback: (chunk: Uint8Array) => void): JsZipStreamHelper;
  on(event: "end", callback: () => void): JsZipStreamHelper;
  on(event: "error", callback: (error: unknown) => void): JsZipStreamHelper;
  pause(): JsZipStreamHelper;
  resume(): JsZipStreamHelper;
}

interface JsZipArchive {
  files: Record<string, JsZipFile>;
  file(path: string): JsZipFile | null;
  file(path: string, data: string | Uint8Array, options?: { binary: boolean }): void;
  generateAsync(options: { type: "blob"; compression: "DEFLATE" }): Promise<Blob>;
}

interface JsZipConstructor {
  new (): JsZipArchive;
  loadAsync(file: Blob): Promise<JsZipArchive>;
}

declare var JSZip: JsZipConstructor | undefined;
