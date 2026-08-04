import { STORES, readOne, writeOne } from "../database/database.js";
import type {
  ContextualWordNoteRecord,
  WordNoteContext,
} from "../models/models.js";
import {
  contextualWordNoteId,
  isValidWordNoteContext,
  normalizedWordNoteContext,
} from "./contextual-word-note.js";

const MAX_NOTE_LENGTH = 20_000;

export async function getContextualWordNote(
  context: WordNoteContext,
): Promise<ContextualWordNoteRecord | undefined> {
  const normalized = normalizedWordNoteContext(context);
  return readOne(STORES.contextualWordNotes, contextualWordNoteId(normalized));
}

export async function saveContextualWordNote(
  context: WordNoteContext,
  markdown: string,
): Promise<ContextualWordNoteRecord> {
  const normalized = normalizedWordNoteContext(context);
  if (!isValidWordNoteContext(normalized)) {
    throw new Error("無法辨識這則筆記對應的教材位置。");
  }
  if (markdown.length > MAX_NOTE_LENGTH) {
    throw new Error("筆記內容不可超過 20,000 個字元。");
  }
  const existing = await getContextualWordNote(normalized);
  const timestamp = new Date().toISOString();
  return writeOne(STORES.contextualWordNotes, {
    ...normalized,
    id: contextualWordNoteId(normalized),
    markdown,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}
