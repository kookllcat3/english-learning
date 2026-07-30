<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";

const errorMessage = ref("");

onErrorCaptured((error) => {
  console.error("Unhandled Vue view error", error);
  errorMessage.value = error instanceof Error ? error.message : "發生未知錯誤。";
  return false;
});

function reloadPage(): void {
  window.location.reload();
}
</script>

<template>
  <section v-if="errorMessage" class="page-shell">
    <div class="empty-state" role="alert">
      <h1>頁面暫時無法顯示</h1>
      <p>{{ errorMessage }}</p>
      <button class="button button--primary" type="button" @click="reloadPage">重新載入</button>
    </div>
  </section>
  <slot v-else />
</template>
