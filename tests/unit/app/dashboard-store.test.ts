import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useDashboardStore } from "../../../src/app/stores/dashboard.js";

describe("dashboard store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("updates the shared dashboard snapshot atomically", () => {
    const store = useDashboardStore();

    store.update({
      statistics: {
        averageCompletion: 0.48,
        knownWordCount: 12,
        materialCount: 3,
      },
    });

    expect(store.knownWordCount).toBe(12);
    expect(store.materialCount).toBe(3);
    expect(store.averageCompletion).toBe(48);
  });
});
