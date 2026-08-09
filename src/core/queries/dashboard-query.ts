import { listMaterials, readKnownWords } from "../learning/material-migrations.js";
import type { MaterialRecord } from "../models/models.js";

const MATERIALS_PER_PAGE = 12;

export type MaterialSort = "newest" | "oldest" | "progress" | "title";

function materialCompletion(material: MaterialRecord): number {
  return material.wordCount === 0 ? 0 : material.knownCount / material.wordCount;
}

function compareMaterials(
  sort: MaterialSort,
): (first: MaterialRecord, second: MaterialRecord) => number {
  if (sort === "oldest") {
    return (first, second) => first.createdAt.localeCompare(second.createdAt);
  }
  if (sort === "title") {
    return (first, second) => first.title.localeCompare(second.title, "zh-Hant");
  }
  if (sort === "progress") {
    return (first, second) => materialCompletion(first) - materialCompletion(second)
      || second.createdAt.localeCompare(first.createdAt);
  }
  return (first, second) => second.createdAt.localeCompare(first.createdAt);
}

export async function getDashboard(
  page = 1,
  query = "",
  sort: MaterialSort = "newest",
) {
  const [materials, knownWords] = await Promise.all([listMaterials(), readKnownWords()]);
  const materialCount = materials.length;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredMaterials = normalizedQuery
    ? materials.filter((material) =>
      `${material.title}\n${material.description}`.toLocaleLowerCase().includes(normalizedQuery))
    : materials;
  filteredMaterials.sort(compareMaterials(sort));
  const filteredCount = filteredMaterials.length;
  const pageCount = Math.max(1, Math.ceil(filteredCount / MATERIALS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const start = (currentPage - 1) * MATERIALS_PER_PAGE;
  const totalProgress = materials.reduce(
    (sum, material) => sum + materialCompletion(material),
    0,
  );
  const statistics = {
    materialCount,
    knownWordCount: knownWords.size,
    averageCompletion: materialCount === 0 ? 0 : totalProgress / materialCount,
  };
  return {
    materials: filteredMaterials.slice(start, start + MATERIALS_PER_PAGE).map((material) => ({
      ...material,
      completion: materialCompletion(material),
    })),
    statistics,
    pagination: {
      currentPage,
      pageCount,
      totalItems: filteredCount,
      totalLibraryItems: materialCount,
      startItem: filteredCount === 0 ? 0 : start + 1,
      endItem: Math.min(start + MATERIALS_PER_PAGE, filteredCount),
      query: query.trim(),
      sort,
    },
  };
}
