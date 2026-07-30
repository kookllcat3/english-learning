<script setup lang="ts">
import { computed } from "vue";
import type {
  ContentBlock,
  TextContentBlock,
  VocabularyRecord,
} from "../../../core/models/models.js";
import {
  familiarityDelay,
  familiarityLevel,
  type FamiliarityLevel,
} from "../familiarity.js";
import MaterialImage from "./MaterialImage.vue";

interface TextSegment {
  delay?: number;
  label: string;
  level?: FamiliarityLevel;
  materialCount?: number;
  word?: string;
}

interface RenderedTextBlock {
  key: string;
  paragraphs: Array<{
    key: string;
    segments: TextSegment[];
  }>;
  type: "text";
}

interface RenderedImageBlock {
  block: Extract<ContentBlock, { type: "image" }>;
  key: string;
  type: "image";
}

const props = defineProps<{
  blocks: ContentBlock[];
  familiarityLevels: FamiliarityLevel[];
  knownWords: Set<string>;
  vocabularyProgress: Map<string, VocabularyRecord>;
}>();

const emit = defineEmits<{
  lookup: [word: string, rect: DOMRect];
}>();

function paragraphs(block: TextContentBlock): string[] {
  return block.text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function textSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const wordPattern = /[a-z]+(?:['’][a-z]+)*/gi;
  let cursor = 0;
  for (const match of text.matchAll(wordPattern)) {
    if (match.index > cursor) segments.push({ label: text.slice(cursor, match.index) });
    const normalizedWord = match[0].replaceAll("’", "'").toLocaleLowerCase("en");
    if (props.knownWords.has(normalizedWord)) {
      const materialCount = props.vocabularyProgress.get(normalizedWord)?.materialCount ?? 0;
      segments.push({
        delay: familiarityDelay(normalizedWord),
        label: match[0],
        level: familiarityLevel(props.familiarityLevels, materialCount),
        materialCount,
        word: normalizedWord,
      });
    } else {
      segments.push({ label: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ label: text.slice(cursor) });
  return segments;
}

const renderedBlocks = computed<Array<RenderedTextBlock | RenderedImageBlock>>(() =>
  [...props.blocks]
    .sort((first, second) => first.order - second.order)
    .map((block, blockIndex) => {
      const key = `${block.order}-${blockIndex}`;
      if (block.type === "image") return { block, key, type: "image" };
      return {
        key,
        type: "text",
        paragraphs: paragraphs(block).map((paragraph, paragraphIndex) => ({
          key: `${key}-${paragraphIndex}`,
          segments: textSegments(paragraph),
        })),
      };
    }));

function lookupKnownWord(event: MouseEvent, word: string): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  emit("lookup", word, target.getBoundingClientRect());
}
</script>

<template>
  <div
    class="reading-content"
    lang="en"
    role="region"
    aria-label="素材內容閱讀區"
    tabindex="0"
  >
    <template v-for="block in renderedBlocks" :key="block.key">
      <template v-if="block.type === 'text'">
        <p
          v-for="paragraph in block.paragraphs"
          :key="paragraph.key"
          data-reading-paragraph
        >
          <template
            v-for="(segment, segmentIndex) in paragraph.segments"
            :key="segmentIndex"
          >
            <span
              v-if="segment.word && segment.level"
              class="known-word"
              :data-known-word="segment.word"
              :data-known-label="segment.label"
              :data-familiarity-level="segment.level.level"
              :title="`熟悉度 Lv.${segment.level.level} · 出現在 ${segment.materialCount} 份素材`"
              :style="{
                '--familiarity-outline-opacity': String(segment.level.outlineOpacity),
                '--outline-flow-opacity': String(segment.level.flowOpacity),
                '--outline-flow-duration': `${segment.level.flowDuration}s`,
                '--outline-glow-blur': `${segment.level.glowBlur}px`,
              }"
              @dblclick.stop="lookupKnownWord($event, segment.word)"
            ><span><span
              v-for="(character, characterIndex) in segment.label"
              :key="characterIndex"
              class="known-word__glyph"
              :style="{ '--glyph-delay': `${(segment.delay ?? 0) + (characterIndex * 85)}ms` }"
            >{{ character }}</span></span></span>
            <template v-else>{{ segment.label }}</template>
          </template>
        </p>
      </template>
      <MaterialImage v-else :block="block.block" />
    </template>
  </div>
</template>
