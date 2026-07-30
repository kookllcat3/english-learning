<script setup lang="ts">
defineProps<{
  message?: string;
  title?: string;
}>();
</script>

<template>
  <div class="empty-state" role="status">
    <h2 v-if="title">{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <slot />
  </div>
</template>
