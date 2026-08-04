import { STORES, readOne, writeOne } from "../database/database.js";
import type { SettingRecord } from "../models/models.js";

const DEFAULT_FAMILIARITY_COLOR = "#d86b48";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SEARCH_HISTORY_LIMIT = 8;
const AI_PROMPT_KEY = "aiPrompt";
const PROMPT_MAX_LENGTH = 20_000;
export const AI_PROMPT_MAX_LENGTH = PROMPT_MAX_LENGTH;

export type MaterialGuidePromptType = "text" | "docx";

const MATERIAL_GUIDE_PROMPT_KEYS: Record<MaterialGuidePromptType, string> = {
  text: "materialGuideTextPrompt",
  docx: "materialGuideDocxPrompt",
};

export const MATERIAL_GUIDE_PROMPT_SETTING_KEYS = Object.values(
  MATERIAL_GUIDE_PROMPT_KEYS,
);
export const MATERIAL_GUIDE_PROMPT_MAX_LENGTH = PROMPT_MAX_LENGTH;

export async function getFamiliarityColor(): Promise<string> {
  const record = await readOne(STORES.settings, "familiarityColor");
  return typeof record?.value === "string" && HEX_COLOR_PATTERN.test(record.value)
    ? record.value
    : DEFAULT_FAMILIARITY_COLOR;
}

export async function setFamiliarityColor(color: string): Promise<SettingRecord> {
  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error("熟悉度標記顏色格式不正確。");
  }
  return writeOne(STORES.settings, {
    key: "familiarityColor",
    value: color.toLocaleLowerCase(),
    updatedAt: new Date().toISOString(),
  });
}

export async function getSearchHistory(): Promise<string[]> {
  const record = await readOne(STORES.settings, "searchHistory");
  return Array.isArray(record?.value)
    ? record.value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function rememberSearchQuery(query: string): Promise<string[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return getSearchHistory();

  const history = await getSearchHistory();
  const updatedHistory = [
    normalizedQuery,
    ...history.filter(
      (item) => item.toLocaleLowerCase() !== normalizedQuery.toLocaleLowerCase(),
    ),
  ].slice(0, SEARCH_HISTORY_LIMIT);

  await writeOne(STORES.settings, {
    key: "searchHistory",
    value: updatedHistory,
    updatedAt: new Date().toISOString(),
  });
  return updatedHistory;
}

export async function clearSearchHistory(): Promise<void> {
  await writeOne(STORES.settings, {
    key: "searchHistory",
    value: [],
    updatedAt: new Date().toISOString(),
  });
}

export async function getAiPrompt(defaultPrompt: string): Promise<string> {
  const record = await readOne(STORES.settings, AI_PROMPT_KEY);
  return typeof record?.value === "string" && record.value.trim()
    ? record.value
    : defaultPrompt;
}

export async function setAiPrompt(prompt: string): Promise<SettingRecord> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt || normalizedPrompt.length > AI_PROMPT_MAX_LENGTH) {
    throw new Error("AI 提示詞長度不正確。");
  }
  return writeOne(STORES.settings, {
    key: AI_PROMPT_KEY,
    value: normalizedPrompt,
    updatedAt: new Date().toISOString(),
  });
}

export async function getMaterialGuidePrompt(
  type: MaterialGuidePromptType,
  defaultPrompt: string,
): Promise<string> {
  const record = await readOne(STORES.settings, MATERIAL_GUIDE_PROMPT_KEYS[type]);
  return typeof record?.value === "string" && record.value.trim()
    ? record.value
    : defaultPrompt;
}

export async function setMaterialGuidePrompt(
  type: MaterialGuidePromptType,
  prompt: string,
): Promise<SettingRecord> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt || normalizedPrompt.length > MATERIAL_GUIDE_PROMPT_MAX_LENGTH) {
    throw new Error("教材生成提示詞不可留白，且不得超過 20,000 個字元。");
  }
  return writeOne(STORES.settings, {
    key: MATERIAL_GUIDE_PROMPT_KEYS[type],
    value: normalizedPrompt,
    updatedAt: new Date().toISOString(),
  });
}
