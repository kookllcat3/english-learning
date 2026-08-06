<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useDashboardStore } from "../../../app/stores/dashboard.js";

const dashboardStore = useDashboardStore();
const {
  averageCompletion,
  knownWordCount,
  materialCount,
} = storeToRefs(dashboardStore);
</script>

<template>
  <section class="dashboard" aria-label="學習統計">
    <article class="metric-card">
      <span class="metric-card__label">已認識單字</span>
      <strong class="metric-card__value">{{ knownWordCount }}</strong>
      <span class="metric-card__unit">個</span>
    </article>
    <article class="metric-card">
      <span class="metric-card__label">學習教材</span>
      <strong class="metric-card__value">{{ materialCount }}</strong>
      <span class="metric-card__unit">份</span>
    </article>
    <article class="metric-card">
      <span class="metric-card__label">平均完成度</span>
      <strong class="metric-card__value">{{ averageCompletion }}%</strong>
    </article>
  </section>

</template>
