export function extractUniqueWords(text: string): string[] {
  const matches = text.toLocaleLowerCase("en").match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  return [...new Set(matches)].sort((first, second) => first.localeCompare(second));
}

export function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.(txt|pdf|docx)$/i, "").trim();
}

export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
