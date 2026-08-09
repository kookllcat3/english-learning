import { materialWithLearningProgress, synchronizeVocabularyRecords } from "../learning/learning-records.js";
import type { MaterialRecord, VocabularyRecord } from "../models/models.js";

export interface MaterialReplacementState {
  material: MaterialRecord;
  vocabulary: VocabularyRecord[];
}

export function materialReplacementState(
  currentMaterial: MaterialRecord,
  replacementWords: string[],
  otherMaterials: MaterialRecord[],
  vocabulary: VocabularyRecord[],
  updatedAt: string,
): MaterialReplacementState {
  const knownWords = replacementWords.filter((word) => currentMaterial.knownWords.includes(word));
  const material = materialWithLearningProgress({
    ...currentMaterial,
    readingParagraphKey: null,
    wordCount: replacementWords.length,
  }, knownWords, updatedAt);
  const learnedWords = new Set([
    ...knownWords,
    ...otherMaterials.flatMap((otherMaterial) => otherMaterial.knownWords),
  ]);
  return {
    material,
    vocabulary: synchronizeVocabularyRecords(vocabulary, learnedWords, updatedAt),
  };
}
