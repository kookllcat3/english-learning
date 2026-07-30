import { defineStore } from "pinia";
import type { DashboardStatistics } from "../../core/models/models.js";

export interface DashboardSnapshot {
  milestone: {
    message: string;
    nextGoal: string;
    title: string;
  };
  statistics: DashboardStatistics;
}

export const useDashboardStore = defineStore("dashboard", {
  state: () => ({
    averageCompletion: 0,
    knownWordCount: 0,
    materialCount: 0,
    milestoneNextGoal: "",
    milestoneTitle: "正在整理你的學習歷程",
  }),
  actions: {
    update(snapshot: DashboardSnapshot): void {
      this.averageCompletion = Math.round(snapshot.statistics.averageCompletion * 100);
      this.knownWordCount = snapshot.statistics.knownWordCount;
      this.materialCount = snapshot.statistics.materialCount;
      this.milestoneNextGoal = snapshot.milestone.nextGoal;
      this.milestoneTitle = snapshot.milestone.title;
    },
  },
});
