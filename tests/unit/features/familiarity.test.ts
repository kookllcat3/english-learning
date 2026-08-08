import { describe, expect, it } from "vitest";
import {
  familiarityDelay,
  familiarityLevel,
  type FamiliarityLevel,
} from "../../../src/features/material/familiarity.js";

const levels: FamiliarityLevel[] = [
  {
    flowDuration: 4,
    flowOpacity: 0,
    glowBlur: 0,
    level: 0,
    minMaterials: 0,
    outlineOpacity: 0,
  },
  {
    flowDuration: 3,
    flowOpacity: 0.5,
    glowBlur: 2,
    level: 1,
    minMaterials: 2,
    outlineOpacity: 0.4,
  },
];

describe("familiarity presentation rules", () => {
  it("selects the highest reached familiarity level", () => {
    expect(familiarityLevel(levels, 1).level).toBe(0);
    expect(familiarityLevel(levels, 2).level).toBe(1);
  });

  it("creates stable animation offsets per word", () => {
    expect(familiarityDelay("animal")).toBe(familiarityDelay("animal"));
    expect(familiarityDelay("animal")).toBeLessThanOrEqual(0);
  });
});
