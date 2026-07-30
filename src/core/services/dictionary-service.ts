import { STORES, readOne, writeOne } from "../database/database.js";
import type {
  DictionaryDefinition,
  DictionaryLookupResult,
  DictionaryRecord,
} from "../models/models.js";

const API_BASE_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const REQUEST_TIMEOUT_MS = 8000;

interface DictionaryApiPhonetic {
  audio?: string;
  text?: string;
}

interface DictionaryApiDefinition {
  definition?: string;
  example?: string;
}

interface DictionaryApiMeaning {
  definitions?: DictionaryApiDefinition[];
  partOfSpeech?: string;
}

interface DictionaryApiEntry {
  meanings?: DictionaryApiMeaning[];
  phonetic?: string;
  phonetics?: DictionaryApiPhonetic[];
  word?: string;
}

function isDictionaryApiEntry(value: unknown): value is DictionaryApiEntry {
  return value !== null && typeof value === "object";
}

function normalizeAudioUrl(url?: string): string {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

function normalizeEntry(entries: DictionaryApiEntry[], word: string): DictionaryRecord {
  const entry = entries[0];
  if (!entry) throw new Error("找不到這個單字的字典資料。");
  const phoneticRecord = entry.phonetics?.find((item) => item.text || item.audio);
  const definitions: DictionaryDefinition[] = (entry.meanings ?? []).flatMap((meaning) =>
    (meaning.definitions ?? []).slice(0, 2).map((definition) => ({
      partOfSpeech: meaning.partOfSpeech ?? "",
      definition: definition.definition ?? "",
      example: definition.example ?? "",
    }))).filter((item) => item.definition).slice(0, 4);

  return {
    word: entry.word?.toLocaleLowerCase("en") || word,
    phonetic: entry.phonetic || phoneticRecord?.text || "",
    audioUrl: normalizeAudioUrl(
      entry.phonetics?.find((item) => item.audio)?.audio || phoneticRecord?.audio,
    ),
    definitions,
    cachedAt: new Date().toISOString(),
  };
}

export async function lookupWord(
  word: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<DictionaryLookupResult> {
  const normalizedWord = word.trim().toLocaleLowerCase("en");
  const cached = await readOne(STORES.dictionaryCache, normalizedWord);
  if (cached) return { ...cached, fromCache: true };

  const controller = new AbortController();
  let timedOut = false;
  const abortRequest = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abortRequest, { once: true });
  }
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${encodeURIComponent(normalizedWord)}`, {
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && !timedOut) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("字典查詢逾時。");
    }
    throw new Error("字典服務暫時無法使用。");
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
  if (response.status === 404) throw new Error("找不到這個單字的字典資料。");
  if (!response.ok) throw new Error("字典服務暫時無法使用。");

  const entries: unknown = await response.json();
  if (!Array.isArray(entries) || !entries.some(isDictionaryApiEntry)) {
    throw new Error("找不到這個單字的字典資料。");
  }
  const result = normalizeEntry(entries.filter(isDictionaryApiEntry), normalizedWord);
  await writeOne(STORES.dictionaryCache, result);
  return { ...result, fromCache: false };
}
