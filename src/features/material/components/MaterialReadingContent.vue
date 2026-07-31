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
  activeWord: string;
  blocks: ContentBlock[];
  familiarityLevels: FamiliarityLevel[];
  knownWords: Set<string>;
  vocabularyProgress: Map<string, VocabularyRecord>;
}>();

const emit = defineEmits<{
  activate: [word: string, rect: DOMRect, key: string];
  deactivate: [];
  lookup: [word: string, rect: DOMRect];
}>();
let touchStart: { pointerId: number; x: number; y: number } | null = null;

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
    const materialCount = props.vocabularyProgress.get(normalizedWord)?.materialCount ?? 0;
    segments.push({
      delay: familiarityDelay(normalizedWord),
      label: match[0],
      level: familiarityLevel(props.familiarityLevels, materialCount),
      materialCount,
      word: normalizedWord,
    });
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

function wordElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".reading-word") : null;
}

function activateWordElement(target: EventTarget | null): void {
  const element = wordElement(target);
  const word = element?.dataset.word;
  const key = element?.dataset.wordKey;
  if (element && word && key) emit("activate", word, element.getBoundingClientRect(), key);
}

function handlePointerOver(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  const element = wordElement(event.target);
  if (!element || element.contains(event.relatedTarget as Node | null)) return;
  activateWordElement(element);
}

function handlePointerOut(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  const element = wordElement(event.target);
  if (!element || element.contains(event.relatedTarget as Node | null)) return;
  emit("deactivate");
}

function beginTouch(event: PointerEvent): void {
  if (event.pointerType === "mouse") return;
  touchStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
}

function finishTouch(event: PointerEvent): void {
  if (!touchStart || touchStart.pointerId !== event.pointerId) return;
  const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
  touchStart = null;
  if (moved <= 8) activateWordElement(event.target);
}

function handleDoubleClick(event: MouseEvent): void {
  const element = wordElement(event.target);
  const word = element?.dataset.word;
  if (element && word) emit("lookup", word, element.getBoundingClientRect());
}

function handleFocusIn(event: FocusEvent): void {
  activateWordElement(event.target);
}

function handleFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (!(next instanceof Element) || !next.closest(".reading-word")) emit("deactivate");
}

function handleWordKeydown(event: KeyboardEvent): void {
  if (!["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) return;
  const words = [...container.querySelectorAll<HTMLElement>(".reading-word")];
  if (words.length === 0) return;
  const current = wordElement(event.target);
  const currentIndex = current ? words.indexOf(current) : -1;
  const nextIndex = event.key === "ArrowLeft"
    ? Math.max(0, currentIndex - 1)
    : Math.min(words.length - 1, currentIndex + 1);
  words[nextIndex].focus();
  event.preventDefault();
}
</script>

<template>
  <div
    class="reading-content"
    lang="en"
    role="region"
    aria-label="素材內容閱讀區"
    tabindex="0"
    @pointerover="handlePointerOver"
    @pointerout="handlePointerOut"
    @pointerdown="beginTouch"
    @pointerup="finishTouch"
    @pointercancel="touchStart = null"
    @dblclick="handleDoubleClick"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
    @keydown="handleWordKeydown"
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
              class="reading-word"
              :class="{
                'is-active': activeWord === `${paragraph.key}-${segmentIndex}`,
                'known-word': knownWords.has(segment.word),
              }"
              :data-known-word="segment.word"
              :data-word="segment.word"
              :data-word-key="`${paragraph.key}-${segmentIndex}`"
              :data-known-label="segment.label"
              :data-familiarity-level="segment.level.level"
              :style="{
                '--familiarity-outline-opacity': String(segment.level.outlineOpacity),
                '--outline-flow-opacity': String(segment.level.flowOpacity),
                '--outline-flow-duration': `${segment.level.flowDuration}s`,
                '--outline-glow-blur': `${segment.level.glowBlur}px`,
              }"
              tabindex="-1"
            ><template v-if="knownWords.has(segment.word)"><span
              v-for="(character, characterIndex) in segment.label"
              :key="characterIndex"
              class="known-word__glyph"
              :style="{ '--glyph-delay': `${(segment.delay ?? 0) + (characterIndex * 85)}ms` }"
            >{{ character }}</span></template><template v-else>{{ segment.label }}</template></span>
            <template v-else>{{ segment.label }}</template>
          </template>
        </p>
      </template>
      <MaterialImage v-else :block="block.block" />
    </template>
  </div>
</template>
