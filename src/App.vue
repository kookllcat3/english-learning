<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import DataManagement from "./features/data-management/components/DataManagement.vue";
import MaterialGuide from "./features/home/components/MaterialGuide.vue";
import AppErrorBoundary from "./shared/components/AppErrorBoundary.vue";
import { usePageActionsStore } from "./app/stores/page-actions.js";

const route = useRoute();
const pageActions = usePageActionsStore();
const onMaterialPage = computed(() => route.name === "material");
</script>

<template>
  <header class="site-header">
    <RouterLink class="brand" :to="{ name: 'home' }" aria-label="回到英文學習庫首頁">
      英文<span>學習庫</span>
    </RouterLink>
    <nav class="header-actions" aria-label="網站工具">
      <DataManagement />
      <template v-if="onMaterialPage">
        <button
          id="open-ai-assistant"
          class="header-icon-button"
          type="button"
          aria-label="開啟 AI 輔助學習"
          title="AI 輔助學習"
          @click="pageActions.requestAiAssistant"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 3.5 13.7 8l4.8 1.8-4.8 1.8L12 16l-1.7-4.4-4.8-1.8L10.3 8 12 3.5Z" />
            <path d="m18.5 15 .8 2.1 2.2.9-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.9.8-2.1Z" />
          </svg>
        </button>
      </template>
      <template v-else>
        <MaterialGuide />
      </template>
    </nav>
  </header>

  <AppErrorBoundary>
    <RouterView />
  </AppErrorBoundary>
</template>
