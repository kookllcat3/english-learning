import { describe, expect, it } from "vitest";
import {
  extractUniqueWords,
  isValidWord,
  normalizeWord,
} from "../../../src/core/text/text.js";

describe("English word normalization", () => {
  it("normalizes case, whitespace, and typographic apostrophes", () => {
    expect(normalizeWord("  Rock’N’Roll  ")).toBe("rock'n'roll");
  });

  it("validates normalized English words", () => {
    expect(isValidWord("rock'n'roll")).toBe(true);
    expect(isValidWord("two words")).toBe(false);
    expect(isValidWord("word<script>")).toBe(false);
  });

  it("extracts, normalizes, de-duplicates, and sorts words", () => {
    expect(extractUniqueWords("Rock’n’roll isn't ROCK’N’ROLL."))
      .toEqual(["isn't", "rock'n'roll"]);
  });
});
