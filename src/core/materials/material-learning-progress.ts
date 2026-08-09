import { currentVocabularyRecord } from "../learning/material-migrations.js";
import { materialWithLearningProgress } from "../learning/learning-records.js";
import type { MaterialRecord, VocabularyRecord } from "../models/models.js";
import { normalizeWord } from "../text/text.js";

export type ReadingParagraphUpdate =
  | { mode: "preserve" }
  | { mode: "set"; paragraphKey: string }
  | { mode: "clear" };

export interface MaterialLearningProgressState {
  material: MaterialRecord;
  vocabulary: VocabularyRecord[];
}

function normalizedUniqueWords(words: string[]): string[] {
  return [...new Set(words.map(normalizeWord).filter(Boolean))];
}

function readingParagraphKey(
  currentMaterial: MaterialRecord,
  update: ReadingParagraphUpdate,
): string | null | undefined {
  if (update.mode === "preserve") return currentMaterial.readingParagraphKey;
  return update.mode === "set" ? update.paragraphKey : null;
}

export function materialLearningProgressState(
  currentMaterial: MaterialRecord,
  materialWords: string[],
  requestedWords: string[],
  currentVocabulary: Array<VocabularyRecord | undefined>,
  readingParagraphUpdate: ReadingParagraphUpdate,
  updatedAt: string,
): MaterialLearningProgressState {
  const normalizedWords = normalizedUniqueWords(requestedWords);
  const materialWordSet = new Set(materialWords);
  if (normalizedWords.some((word) => !materialWordSet.has(word))) {
    throw new Error("指定的單字不屬於這份教材。");
  }

  const knownWords = new Set(currentMaterial.knownWords);
  normalizedWords.forEach((word) => knownWords.add(word));
  const orderedKnownWords = materialWords.filter((word) => knownWords.has(word));
  const material = materialWithLearningProgress({
    ...currentMaterial,
    readingParagraphKey: readingParagraphKey(currentMaterial, readingParagraphUpdate),
  }, orderedKnownWords, updatedAt);
  const vocabulary = normalizedWords.map((word, index) => {
    const record = currentVocabulary[index] ?? {
      word,
      learned: false,
      createdAt: updatedAt,
    };
    return {
      ...currentVocabularyRecord(record),
      word,
      learned: true,
      learnedAt: record.learnedAt ?? updatedAt,
      updatedAt,
    };
  });

  return { material, vocabulary };
}
