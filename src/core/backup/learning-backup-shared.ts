export const MAX_BACKUP_ASSET_BYTES = 2 * 1024 * 1024;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function dataUrlToWebpBlob(dataUrl: string): Blob {
  const match = /^data:(image\/webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("備份包含格式不正確的 WebP 圖片。");

  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const hasWebpHeader = bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!hasWebpHeader) throw new Error("備份包含損壞的 WebP 圖片。");

  return new Blob([bytes], { type: match[1].toLocaleLowerCase() });
}
