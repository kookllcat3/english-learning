import { defineStore } from "pinia";

export const usePageActionsStore = defineStore("page-actions", {
  state: () => ({
    aiAssistantRequest: 0,
  }),
  actions: {
    requestAiAssistant(): void {
      this.aiAssistantRequest += 1;
    },
  },
});
