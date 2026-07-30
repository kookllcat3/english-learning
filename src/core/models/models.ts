export interface TextContentBlock {
  type: "text";
  text: string;
  order: number;
}

export interface ImageContentBlock {
  type: "image";
  assetId: string;
  alt?: string;
  caption?: string;
  order: number;
}

export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface MaterialRecord {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  knownCount: number;
  knownWords: string[];
  content?: string;
  contentBlocks?: ContentBlock[];
}

export interface MaterialContentRecord {
  materialId: string;
  content: string;
  contentBlocks: ContentBlock[];
}

export interface MaterialTermsRecord {
  materialId: string;
  words: string[];
}

export interface MaterialAssetRecord {
  id: string;
  materialId: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  alt?: string;
  caption?: string;
}

export interface VocabularyRecord {
  word: string;
  learned: boolean;
  learnedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
  materialCount?: number;
  exposureCount?: number;
  lastSeenAt?: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt?: string;
}

export interface DictionaryDefinition {
  partOfSpeech: string;
  definition: string;
  example: string;
}

export interface DictionaryRecord {
  word: string;
  phonetic: string;
  audioUrl: string;
  definitions: DictionaryDefinition[];
  cachedAt: string;
}

export interface DictionaryLookupResult extends DictionaryRecord {
  fromCache: boolean;
}

export interface MaterialBundle {
  metadata: MaterialRecord;
  content: string;
  contentBlocks: ContentBlock[];
  words: string[];
  assets?: MaterialAssetRecord[];
}

export interface BackupStoreRecords {
  materials: MaterialRecord[];
  materialAssets?: MaterialAssetRecord[];
  materialContents: MaterialContentRecord[];
  materialTerms: MaterialTermsRecord[];
  vocabulary: VocabularyRecord[];
  settings: SettingRecord[];
}

export interface BackupMaterial extends MaterialRecord {
  content: string;
  contentBlocks: ContentBlock[];
}

export interface BackupMaterialAsset extends Omit<MaterialAssetRecord, "blob"> {
  data: string;
}

export interface LearningBackup {
  schemaVersion: number;
  exportedAt?: string;
  materials: BackupMaterial[];
  materialAssets?: BackupMaterialAsset[];
  vocabulary: VocabularyRecord[];
  settings?: SettingRecord[];
}

export interface CreateMaterialInput {
  title: string;
  description: string;
  content: string;
  contentBlocks?: ContentBlock[];
  assets?: Array<Omit<MaterialAssetRecord, "materialId">>;
  fileName: string;
}

export interface DashboardStatistics {
  materialCount: number;
  knownWordCount: number;
  completedMaterialCount: number;
  averageCompletion: number;
}
