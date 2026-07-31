import { describe, expect, it } from "vitest";
import { calculateWordCardTop } from "../../../src/features/material/word-card-position.js";

const viewport = {
  cardHeight: 380,
  gap: 10,
  margin: 12,
  minimumTop: 100,
  viewportHeight: 900,
};

describe("word card positioning", () => {
  it("places the card below a word when the full card fits", () => {
    expect(calculateWordCardTop({ ...viewport, targetTop: 180, targetBottom: 205 })).toBe(215);
  });

  it("places the full card above a word near the viewport bottom", () => {
    expect(calculateWordCardTop({ ...viewport, targetTop: 700, targetBottom: 725 })).toBe(310);
  });

  it("keeps the target line clear when neither side fully fits", () => {
    expect(calculateWordCardTop({ ...viewport, targetTop: 480, targetBottom: 505 })).toBe(515);
  });
});
