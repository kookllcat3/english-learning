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
      milestone: {
        title: "持續累積",
        message: "下一個里程碑就在前方。",
        nextGoal: "再認識 13 個詞彙",
      },
      statistics: {
        averageCompletion: 0.48,
        completedMaterialCount: 1,
        knownWordCount: 12,
        materialCount: 3,
      },
    });

    expect(store.knownWordCount).toBe(12);
    expect(store.materialCount).toBe(3);
    expect(store.averageCompletion).toBe(48);
    expect(store.milestoneNextGoal).toBe("再認識 13 個詞彙");
  });
});
