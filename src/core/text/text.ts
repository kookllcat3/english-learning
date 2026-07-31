const ENGLISH_WORD_PATTERN = /^[a-z]+(?:'[a-z]+)*$/;

export function normalizeWord(word: string): string {
  return word.trim().replaceAll("’", "'").toLocaleLowerCase("en");
}

export function isValidWord(word: string): boolean {
  return ENGLISH_WORD_PATTERN.test(word);
}

export function extractUniqueWords(text: string): string[] {
  const matches = text.match(/[a-z]+(?:['’][a-z]+)*/gi) ?? [];
  return [...new Set(matches.map(normalizeWord))]
    .sort((first, second) => first.localeCompare(second));
}

export function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.(txt|pdf|docx)$/i, "").trim();
}

export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
