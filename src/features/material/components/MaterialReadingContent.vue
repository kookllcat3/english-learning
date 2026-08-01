<script setup lang="ts">
import { computed } from "vue";
import type {
  ContentBlock,
  TextContentBlock,
  VocabularyRecord,
} from "../../../core/models/models.js";
import { normalizeWord } from "../../../core/text/text.js";
import {
  familiarityDelay,
  familiarityLevel,
  type FamiliarityLevel,
} from "../familiarity.js";
import MaterialImage from "./MaterialImage.vue";

interface TextSegment {
  delay?: number;
  isTranslation: boolean;
  label: string;
  word?: string;
}

interface WordPresentation {
  level: FamiliarityLevel;
  style: Record<string, string>;
}

interface RenderedTextBlock {
  key: string;
  paragraphs: Array<{
    key: string;
    lines: Array<{
      isTranslation: boolean;
      key: string;
      segments: TextSegment[];
    }>;
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
  hideTranslations: boolean;
  vocabularyProgress: Map<string, VocabularyRecord>;
}>();

const emit = defineEmits<{
  activate: [word: string, rect: DOMRect, key: string, trigger: "hover" | "focus" | "touch"];
  deactivate: [];
  lookup: [word: string, rect: DOMRect];
}>();
let touchStart: { pointerId: number; x: number; y: number } | null = null;

function paragraphs(block: TextContentBlock): string[] {
  return block.text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function appendPlainTextSegments(text: string, segments: TextSegment[]): void {
  if (!text) return;
  let start = 0;
  let translation = /[\u3400-\u9fff]/u.test(text[0]);
  for (let index = 1; index < text.length; index += 1) {
    const nextTranslation = /[\u3400-\u9fff]/u.test(text[index]);
    if (nextTranslation === translation) continue;
    segments.push({ isTranslation: translation, label: text.slice(start, index) });
    start = index;
    translation = nextTranslation;
  }
  segments.push({ isTranslation: translation, label: text.slice(start) });
}

function textSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const wordPattern = /[a-z]+(?:['’][a-z]+)*/gi;
  let cursor = 0;
  for (const match of text.matchAll(wordPattern)) {
    if (match.index > cursor) {
      appendPlainTextSegments(text.slice(cursor, match.index), segments);
    }
    const normalizedWord = normalizeWord(match[0]);
    segments.push({
      delay: familiarityDelay(normalizedWord),
      isTranslation: false,
      label: match[0],
      word: normalizedWord,
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    appendPlainTextSegments(text.slice(cursor), segments);
  }
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
          lines: paragraph.split("\n").map((line, lineIndex) => ({
            isTranslation: /[\u3400-\u9fff]/u.test(line),
            key: `${key}-${paragraphIndex}-${lineIndex}`,
            segments: textSegments(line),
          })),
        })),
      };
    }));

const wordPresentations = computed(() => {
  const presentations = new Map<string, WordPresentation>();
  renderedBlocks.value.forEach((block) => {
    if (block.type !== "text") return;
    block.paragraphs.forEach((paragraph) => {
      paragraph.lines.forEach((line) => line.segments.forEach((segment) => {
        if (!segment.word || presentations.has(segment.word)) return;
        const materialCount = props.vocabularyProgress.get(segment.word)?.materialCount ?? 0;
        const level = familiarityLevel(props.familiarityLevels, materialCount);
        presentations.set(segment.word, {
          level,
          style: {
            "--familiarity-outline-opacity": String(level.outlineOpacity),
            "--outline-flow-opacity": String(level.flowOpacity),
            "--outline-flow-duration": `${level.flowDuration}s`,
            "--outline-glow-blur": `${level.glowBlur}px`,
          },
        });
      }));
    });
  });
  return presentations;
});

function presentationFor(segment: TextSegment): WordPresentation | undefined {
  return segment.word ? wordPresentations.value.get(segment.word) : undefined;
}

function hasFamiliarity(segment: TextSegment): boolean {
  return (presentationFor(segment)?.level.level ?? 0) > 0;
}

function wordElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".reading-word") : null;
}

function activateWordElement(target: EventTarget | null): void {
  const element = wordElement(target);
  const word = element?.dataset.word;
  const key = element?.dataset.wordKey;
  if (element && word && key) emit("activate", word, element.getBoundingClientRect(), key, "focus");
}

function handlePointerOver(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  const element = wordElement(event.target);
  if (!element || element.contains(event.relatedTarget as Node | null)) return;
  const word = element.dataset.word;
  const key = element.dataset.wordKey;
  if (word && key) emit("activate", word, element.getBoundingClientRect(), key, "hover");
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
  if (moved <= 8) {
    const element = wordElement(event.target);
    const word = element?.dataset.word;
    const key = element?.dataset.wordKey;
    if (element && word && key) emit("activate", word, element.getBoundingClientRect(), key, "touch");
  }
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
          <template v-for="line in paragraph.lines" :key="line.key">
            <span
              class="reading-line"
              :class="{ 'translation-mask': props.hideTranslations && line.isTranslation }"
            >
            <template
              v-for="(segment, segmentIndex) in line.segments"
              :key="segmentIndex"
            >
            <span
              v-if="segment.word"
              class="reading-word"
              :class="{
                'is-active': activeWord === `${line.key}-${segmentIndex}`,
                'known-word': hasFamiliarity(segment),
              }"
              :data-known-word="segment.word"
              :data-word="segment.word"
              :data-word-key="`${line.key}-${segmentIndex}`"
              :data-known-label="segment.label"
              :style="presentationFor(segment)?.style"
              tabindex="-1"
            ><template v-if="hasFamiliarity(segment)"><span
              v-for="(character, characterIndex) in segment.label"
              :key="characterIndex"
              class="known-word__glyph"
              :style="{ '--glyph-delay': `${(segment.delay ?? 0) + (characterIndex * 85)}ms` }"
            >{{ character }}</span></template><template v-else>{{ segment.label }}</template></span>
            <span
              v-else
              :class="{ 'translation-mask': props.hideTranslations && segment.isTranslation }"
            >{{ segment.label }}</span>
            </template>
            </span>
          </template>
        </p>
      </template>
      <MaterialImage v-else :block="block.block" />
    </template>
  </div>
</template>
