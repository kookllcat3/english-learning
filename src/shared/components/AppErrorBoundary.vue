<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";
import { errorMessage as getErrorMessage } from "../errors.js";

const errorMessage = ref("");

onErrorCaptured((error) => {
  console.error("Unhandled Vue view error", error);
  errorMessage.value = getErrorMessage(error);
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
