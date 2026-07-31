declare module "*jszip.min.js";

interface JsZipFile {
  dir: boolean;
  async(type: "blob"): Promise<Blob>;
  async(type: "text"): Promise<string>;
  async(type: "uint8array"): Promise<Uint8Array>;
}

interface JsZipArchive {
  files: Record<string, JsZipFile>;
  file(path: string): JsZipFile | null;
  file(path: string, data: string | Uint8Array, options?: { binary: boolean }): void;
  generateAsync(options: { type: "blob"; compression: "DEFLATE" }): Promise<Blob>;
}

interface JsZipConstructor {
  new (): JsZipArchive;
  loadAsync(file: Blob, options?: { checkCRC32?: boolean }): Promise<JsZipArchive>;
}

declare var JSZip: JsZipConstructor | undefined;
