<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getMaterialAsset } from "../../../core/learning/learning-repository.js";
import type { ImageContentBlock } from "../../../core/models/models.js";

const props = defineProps<{ block: ImageContentBlock }>();

const figure = ref<HTMLElement | null>(null);
const imageUrl = ref("");
const imageAlt = ref("");
const imageWidth = ref(0);
const imageHeight = ref(0);
const caption = ref("");
const errorMessage = ref("");
let observer: IntersectionObserver | null = null;
let disposed = false;

function releaseImageUrl(): void {
  if (!imageUrl.value) return;
  URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = "";
}

async function loadImage(): Promise<void> {
  try {
    const asset = await getMaterialAsset(props.block.assetId);
    if (disposed) return;
    if (!asset?.blob || asset.mimeType !== "image/webp") {
      errorMessage.value = props.block.alt || "圖片無法載入";
      return;
    }
    imageUrl.value = URL.createObjectURL(asset.blob);
    imageAlt.value = props.block.alt || asset.alt || "教材圖片";
    imageWidth.value = asset.width;
    imageHeight.value = asset.height;
    caption.value = props.block.caption || asset.caption || "";
  } catch {
    if (!disposed) errorMessage.value = props.block.alt || "圖片無法載入";
  }
}

function handleImageError(): void {
  releaseImageUrl();
  errorMessage.value = props.block.alt || "圖片無法載入";
}

onMounted(() => {
  if (!figure.value || !("IntersectionObserver" in window)) {
    void loadImage();
    return;
  }
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return;
    observer?.disconnect();
    observer = null;
    void loadImage();
  }, { rootMargin: "600px 0px" });
  observer.observe(figure.value);
});

onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  releaseImageUrl();
});
</script>

<template>
  <figure ref="figure" class="reading-figure">
    <p v-if="errorMessage" class="reading-image-error">{{ errorMessage }}</p>
    <template v-else-if="imageUrl">
      <img
        :src="imageUrl"
        :alt="imageAlt"
        :width="imageWidth"
        :height="imageHeight"
        decoding="async"
        @error="handleImageError"
      >
      <figcaption v-if="caption">{{ caption }}</figcaption>
    </template>
    <p v-else class="reading-image-loading">圖片載入中…</p>
  </figure>
</template>
