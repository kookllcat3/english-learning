interface WordCardVerticalPosition {
  cardHeight: number;
  gap: number;
  margin: number;
  minimumTop: number;
  placementHeight: number;
  targetBottom: number;
  targetTop: number;
  viewportHeight: number;
}

export function calculateWordCardTop(position: WordCardVerticalPosition): number {
  const belowTop = position.targetBottom + position.gap;
  const aboveTop = position.targetTop - position.gap - position.cardHeight;
  const roomBelow = position.viewportHeight - position.margin - belowTop;
  const roomAbove = position.targetTop - position.gap - position.minimumTop;
  if (position.placementHeight <= roomBelow) return belowTop;
  if (position.placementHeight <= roomAbove) return aboveTop;
  return roomAbove >= roomBelow ? aboveTop : belowTop;
}
