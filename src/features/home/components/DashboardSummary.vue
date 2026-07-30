<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useDashboardStore } from "../../../app/stores/dashboard.js";

const dashboardStore = useDashboardStore();
const {
  averageCompletion,
  knownWordCount,
  materialCount,
  milestoneNextGoal,
  milestoneTitle,
} = storeToRefs(dashboardStore);
</script>

<template>
  <section class="dashboard" aria-label="學習統計">
    <article class="metric-card">
      <span class="metric-card__label">已認識詞彙</span>
      <strong class="metric-card__value">{{ knownWordCount }}</strong>
      <span class="metric-card__unit">個</span>
    </article>
    <article class="metric-card">
      <span class="metric-card__label">學習素材</span>
      <strong class="metric-card__value">{{ materialCount }}</strong>
      <span class="metric-card__unit">份</span>
    </article>
    <article class="metric-card">
      <span class="metric-card__label">平均完成度</span>
      <strong class="metric-card__value">{{ averageCompletion }}%</strong>
    </article>
  </section>

  <section class="milestone-card" aria-labelledby="milestone-title">
    <div class="milestone-card__icon" aria-hidden="true">
      ✦
    </div>
    <div>
      <p class="eyebrow">Your milestone</p>
      <h2 id="milestone-title">
        {{ milestoneTitle }}
      </h2>
      <strong>{{ milestoneNextGoal }}</strong>
    </div>
  </section>
</template>
