import { STORES, readOne, writeOne } from "../database/database.js";
import type { WordNoteRecord } from "../models/models.js";
import { isValidWord, normalizeWord } from "../text/text.js";

const MAX_NOTE_LENGTH = 20_000;

export async function getWordNote(word: string): Promise<WordNoteRecord | undefined> {
  return readOne(STORES.wordNotes, normalizeWord(word));
}

export async function saveWordNote(word: string, markdown: string): Promise<WordNoteRecord> {
  const normalizedWord = normalizeWord(word);
  if (!isValidWord(normalizedWord)) {
    throw new Error("無法儲存格式不正確的單字筆記。");
  }
  if (markdown.length > MAX_NOTE_LENGTH) {
    throw new Error("單字筆記不可超過 20,000 個字元。");
  }
  const existing = await getWordNote(normalizedWord);
  const timestamp = new Date().toISOString();
  return writeOne(STORES.wordNotes, {
    word: normalizedWord,
    markdown,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}
