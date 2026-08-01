let jsZipPromise: Promise<JsZipConstructor> | undefined;

export function loadJsZip(): Promise<JsZipConstructor> {
  if (globalThis.JSZip) return Promise.resolve(globalThis.JSZip);
  jsZipPromise ??= import("../../vendor/jszip/jszip.min.js")
    .then((module) => {
      const constructor = module.default ?? globalThis.JSZip;
      if (!constructor) throw new Error("備份壓縮元件未載入。");
      globalThis.JSZip = constructor;
      return constructor;
    })
    .catch((error: unknown) => {
      jsZipPromise = undefined;
      throw error;
    });
  return jsZipPromise;
}
