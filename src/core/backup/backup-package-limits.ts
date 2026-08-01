export const MAX_PACKAGE_ENTRIES = 10_000;
export const MAX_PACKAGE_ARCHIVE_BYTES = 256 * 1024 * 1024;
export const MAX_PACKAGE_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_PACKAGE_EXPANDED_BYTES = 256 * 1024 * 1024;

export interface ArchiveEntrySize {
  compressedSize: number;
  directory: boolean;
  path: string;
  uncompressedSize: number;
}

export class ArchiveReadBudget {
  private expandedBytes = 0;

  consume(path: string, currentFileBytes: number, chunkBytes: number): number {
    const nextFileBytes = currentFileBytes + chunkBytes;
    if (!Number.isSafeInteger(nextFileBytes) || nextFileBytes > MAX_PACKAGE_FILE_BYTES) {
      throw new Error(`備份檔案大小超出安全範圍：${path}`);
    }
    const nextExpandedBytes = this.expandedBytes + chunkBytes;
    if (!Number.isSafeInteger(nextExpandedBytes) || nextExpandedBytes > MAX_PACKAGE_EXPANDED_BYTES) {
      throw new Error("備份解壓後的總容量超出安全範圍。");
    }
    this.expandedBytes = nextExpandedBytes;
    return nextFileBytes;
  }
}

export function assertPackageArchiveSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_PACKAGE_ARCHIVE_BYTES) {
    throw new Error("備份封裝檔案大小超出安全範圍。");
  }
}

export function assertArchiveResourceLimits(entries: ArchiveEntrySize[]): void {
  if (entries.length > MAX_PACKAGE_ENTRIES) {
    throw new Error("備份封裝包含過多檔案。");
  }
  const files = entries.filter((entry) => !entry.directory);

  let expandedBytes = 0;
  for (const entry of files) {
    if (
      !Number.isSafeInteger(entry.compressedSize)
      || entry.compressedSize < 0
      || !Number.isSafeInteger(entry.uncompressedSize)
      || entry.uncompressedSize < 0
      || entry.uncompressedSize > MAX_PACKAGE_FILE_BYTES
    ) {
      throw new Error(`備份檔案大小超出安全範圍：${entry.path}`);
    }
    expandedBytes += entry.uncompressedSize;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > MAX_PACKAGE_EXPANDED_BYTES) {
      throw new Error("備份解壓後的總容量超出安全範圍。");
    }
  }
}
