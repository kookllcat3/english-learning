import familiarityConfig from "./config/familiarity-levels.json";

export interface FamiliarityLevel {
  flowDuration: number;
  flowOpacity: number;
  glowBlur: number;
  level: number;
  minMaterials: number;
  outlineOpacity: number;
}

export interface FamiliarityPresentation {
  level: FamiliarityLevel;
  style: Record<string, string>;
}

interface FamiliarityConfig {
  basis: string;
  levels: FamiliarityLevel[];
  version: number;
}

function isValidLevel(level: FamiliarityLevel, index: number): boolean {
  return Number.isInteger(level.level)
    && level.level === index
    && Number.isInteger(level.minMaterials)
    && level.minMaterials >= 0
    && Number.isFinite(level.outlineOpacity)
    && level.outlineOpacity >= 0
    && level.outlineOpacity <= 1
    && Number.isFinite(level.flowOpacity)
    && level.flowOpacity >= 0
    && level.flowOpacity <= 1
    && Number.isFinite(level.flowDuration)
    && level.flowDuration > 0
    && Number.isFinite(level.glowBlur)
    && level.glowBlur >= 0;
}

export async function loadFamiliarityLevels(): Promise<FamiliarityLevel[]> {
  const config = familiarityConfig as FamiliarityConfig;
  const levels = config?.levels;
  const thresholdsIncrease = levels?.every(
    (level, index) => index === 0 || level.minMaterials > levels[index - 1].minMaterials,
  );
  if (
    config?.version !== 1
    || config?.basis !== "distinctMaterialCount"
    || !Array.isArray(levels)
    || levels.length === 0
    || !levels.every(isValidLevel)
    || !thresholdsIncrease
  ) {
    throw new Error("熟悉度等級設定格式不正確。");
  }
  return levels;
}

export function familiarityLevel(
  levels: FamiliarityLevel[],
  materialCount: number,
): FamiliarityLevel {
  return levels.reduce(
    (matched, level) => (materialCount >= level.minMaterials ? level : matched),
    levels[0],
  );
}

export function familiarityPresentation(
  levels: FamiliarityLevel[],
  materialCount: number,
): FamiliarityPresentation {
  const level = familiarityLevel(levels, materialCount);
  return {
    level,
    style: {
      "--familiarity-outline-opacity": String(level.outlineOpacity),
      "--outline-flow-opacity": String(level.flowOpacity),
      "--outline-flow-duration": `${level.flowDuration}s`,
      "--outline-glow-blur": `${level.glowBlur}px`,
    },
  };
}

export function familiarityDelay(word: string): number {
  const hash = [...word].reduce(
    (value, character) => ((value * 31) + (character.codePointAt(0) ?? 0)) >>> 0,
    0,
  );
  return -(hash % 2600);
}
