import {
  STORES,
  deleteOne,
  readAllByIndex,
  writeMaterialHighlight,
} from "../database/database.js";
import type {
  MaterialAnnotationRecord,
  MaterialHighlightAnnotationRecord,
} from "../models/models.js";

export async function listMaterialAnnotations(
  materialId: string,
): Promise<MaterialAnnotationRecord[]> {
  return readAllByIndex(STORES.materialAnnotations, "materialId", materialId);
}

export async function listMaterialHighlights(
  materialId: string,
): Promise<MaterialHighlightAnnotationRecord[]> {
  const annotations = await readAllByIndex(
    STORES.materialAnnotations,
    "materialIdKind",
    [materialId, "highlight"],
  );
  return annotations.filter((annotation): annotation is MaterialHighlightAnnotationRecord => (
    annotation.kind === "highlight"
  ));
}

export function saveMaterialHighlight(
  annotation: MaterialHighlightAnnotationRecord,
): Promise<MaterialHighlightAnnotationRecord> {
  return writeMaterialHighlight(annotation);
}

export function deleteMaterialAnnotation(id: string): Promise<void> {
  return deleteOne(STORES.materialAnnotations, id);
}
