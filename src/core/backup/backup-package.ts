import type { LearningBackup } from "../models/models.js";
import { loadJsZip } from "../services/jszip-loader.js";

const PACKAGE_FORMAT = "english-learning-package";
const PACKAGE_VERSION = 1;
const DATA_FILES = [
  "data/materials.json",
  "data/vocabulary.json",
  "data/word-notes.json",
  "data/settings.json",
  "data/material-assets.json",
] as const;
const MAX_PACKAGE_ENTRIES = 10_000;

interface PackageManifest {
  format: string;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  applicationVersion: string;
  files: Array<{ path: string; type: string; size: number }>;
  counts: { materials: number; vocabulary: number; wordNotes: number; assets: number };
  compression: "DEFLATE";
}

interface PackageChecksums {
  algorithm: "SHA-256";
  files: Record<string, string>;
}

export interface BackupPackagePreview {
  backup: LearningBackup;
  manifest: PackageManifest;
}

async function loadZip(): Promise<JsZipConstructor> {
  return loadJsZip();
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function base64ToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) throw new Error("圖片資產格式不正確。");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..") && !path.includes("\0");
}

function requiredPackageFile(archive: JsZipArchive, path: string): JsZipFile {
  const file = archive.file(path);
  if (!file || file.dir) throw new Error(`備份缺少必要檔案：${path}`);
  return file;
}

async function readString(file: JsZipFile): Promise<string> {
  const value = await file.async("text");
  if (typeof value !== "string") throw new Error("備份文字檔格式不正確。");
  return value;
}

export async function createBackupPackage(backup: LearningBackup): Promise<Blob> {
  const Zip = await loadZip();
  const archive = new Zip();
  const files = new Map<string, Uint8Array>();
  const materials = new TextEncoder().encode(jsonText(backup.materials));
  const vocabulary = new TextEncoder().encode(jsonText(backup.vocabulary));
  const wordNotes = new TextEncoder().encode(jsonText(backup.wordNotes ?? []));
  const settings = new TextEncoder().encode(jsonText(backup.settings ?? []));
  const assetMetadata = new TextEncoder().encode(jsonText((backup.materialAssets ?? []).map(({ data: _data, ...asset }) => asset)));
  files.set(DATA_FILES[0], materials);
  files.set(DATA_FILES[1], vocabulary);
  files.set(DATA_FILES[2], wordNotes);
  files.set(DATA_FILES[3], settings);
  files.set(DATA_FILES[4], assetMetadata);

  for (const asset of backup.materialAssets ?? []) files.set(`assets/${asset.id}.webp`, base64ToBytes(asset.data));

  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_VERSION,
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt ?? new Date().toISOString(),
    applicationVersion: "english-learning",
    files: [...files].map(([path, bytes]) => ({
      path,
      type: path.startsWith("assets/") ? "asset" : "data",
      size: bytes.byteLength,
    })),
    counts: {
      materials: backup.materials.length,
      vocabulary: backup.vocabulary.length,
      wordNotes: backup.wordNotes?.length ?? 0,
      assets: backup.materialAssets?.length ?? 0,
    },
    compression: "DEFLATE",
  };
  const checksums: PackageChecksums = { algorithm: "SHA-256", files: {} };
  for (const [path, bytes] of files) {
    checksums.files[path] = await sha256(bytes);
    archive.file(path, bytes, { binary: true });
  }
  archive.file("manifest.json", jsonText(manifest));
  archive.file("checksums.json", jsonText(checksums));
  return archive.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function readBackupPackage(file: Blob): Promise<BackupPackagePreview> {
  const Zip = await loadZip();
  const archive = await Zip.loadAsync(file, { checkCRC32: true });
  const archivePaths = Object.keys(archive.files);
  const paths = Object.entries(archive.files)
    .filter(([, entry]) => !entry.dir)
    .map(([path]) => path);
  if (paths.length > MAX_PACKAGE_ENTRIES || archivePaths.some((path) => !safePath(path))) {
    throw new Error("備份封裝檔案清單不安全。");
  }
  const manifest = JSON.parse(await readString(requiredPackageFile(archive, "manifest.json"))) as PackageManifest;
  if (manifest.format !== PACKAGE_FORMAT || manifest.formatVersion !== PACKAGE_VERSION) {
    throw new Error("不支援的備份封裝版本。");
  }
  if (!Array.isArray(manifest.files) || !manifest.files.every((item) => safePath(item.path))) {
    throw new Error("備份 manifest 檔案清單不正確。");
  }
  const declaredPaths = new Set(["manifest.json", "checksums.json", ...manifest.files.map((item) => item.path)]);
  if (paths.some((path) => !declaredPaths.has(path))) throw new Error("備份包含未列出的檔案。");
  if (manifest.files.some((item) => !Number.isSafeInteger(item.size) || item.size < 0)) {
    throw new Error("備份檔案大小不正確。");
  }
  const checksums = JSON.parse(await readString(requiredPackageFile(archive, "checksums.json"))) as PackageChecksums;
  if (checksums.algorithm !== "SHA-256" || !checksums.files) throw new Error("備份 checksum 格式不正確。");
  if (Object.keys(checksums.files).some((path) => !declaredPaths.has(path))) {
    throw new Error("備份 checksum 清單不正確。");
  }
  for (const entry of manifest.files) {
    const fileEntry = requiredPackageFile(archive, entry.path);
    const bytes = await fileEntry.async("uint8array") as Uint8Array;
    if (bytes.byteLength !== entry.size || checksums.files[entry.path] !== await sha256(bytes)) {
      throw new Error(`備份檔案驗證失敗：${entry.path}`);
    }
  }
  const decode = (text: string): unknown => JSON.parse(text);
  const backup: LearningBackup = {
    schemaVersion: manifest.schemaVersion,
    exportedAt: manifest.exportedAt,
    materials: decode(await readString(requiredPackageFile(archive, DATA_FILES[0]))) as LearningBackup["materials"],
    vocabulary: decode(await readString(requiredPackageFile(archive, DATA_FILES[1]))) as LearningBackup["vocabulary"],
    wordNotes: decode(await readString(requiredPackageFile(archive, DATA_FILES[2]))) as LearningBackup["wordNotes"],
    settings: decode(await readString(requiredPackageFile(archive, DATA_FILES[3]))) as LearningBackup["settings"],
    materialAssets: [],
  };
  const assetMetadata = decode(await readString(requiredPackageFile(archive, DATA_FILES[4]))) as Array<Omit<NonNullable<LearningBackup["materialAssets"]>[number], "data">>;
  for (const asset of manifest.files.filter((entry) => entry.type === "asset")) {
    const bytes = await requiredPackageFile(archive, asset.path).async("uint8array") as Uint8Array;
    const id = asset.path.slice("assets/".length, -".webp".length);
    const metadata = assetMetadata.find((item) => item.id === id);
    if (!metadata) throw new Error(`找不到圖片資產 metadata：${id}`);
    backup.materialAssets?.push({ ...metadata, data: bytesToDataUrl(bytes, "image/webp") });
  }
  return { backup, manifest };
}
