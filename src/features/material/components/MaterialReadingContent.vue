<script setup lang="ts">
import { computed, ref } from "vue";
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
    lastOriginalLineKey?: string;
    lines: Array<{
      isTranslation: boolean;
      key: string;
      segments: TextSegment[];
    }>;
    words: string[];
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
  currentParagraphKey: string | null;
  familiarityLevels: FamiliarityLevel[];
  vocabularyProgress: Map<string, VocabularyRecord>;
}>();

const emit = defineEmits<{
  activate: [word: string, rect: DOMRect, key: string, trigger: "hover" | "focus" | "touch"];
  deactivate: [];
  learnParagraph: [words: string[]];
  lookup: [word: string, rect: DOMRect];
  toggleReadingParagraph: [paragraphKey: string];
}>();
let touchStart: { pointerId: number; x: number; y: number } | null = null;
const hiddenTranslationLines = ref(new Set<string>());

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
        paragraphs: paragraphs(block).map((paragraph, paragraphIndex) => {
          const lines = paragraph.split("\n").map((line, lineIndex) => ({
            isTranslation: /[\u3400-\u9fff]/u.test(line),
            key: `${key}-${paragraphIndex}-${lineIndex}`,
            segments: textSegments(line),
          }));
          const originalLines = lines.filter((line) => !line.isTranslation);
          return {
            key: `${key}-${paragraphIndex}`,
            lastOriginalLineKey: originalLines.at(-1)?.key,
            lines,
            words: [...new Set(originalLines.flatMap((line) =>
              line.segments.flatMap((segment) => segment.word ? [segment.word] : [])))],
          };
        }),
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

function isParagraphKnown(words: string[]): boolean {
  return words.length > 0 && words.every((word) => props.vocabularyProgress.get(word)?.learned);
}

function isTranslationHidden(lineKey: string): boolean {
  return hiddenTranslationLines.value.has(lineKey);
}

function toggleTranslation(lineKey: string, event: MouseEvent): void {
  const nextHiddenLines = new Set(hiddenTranslationLines.value);
  if (nextHiddenLines.has(lineKey)) nextHiddenLines.delete(lineKey);
  else nextHiddenLines.add(lineKey);
  hiddenTranslationLines.value = nextHiddenLines;
  if (event.detail > 0 && event.currentTarget instanceof HTMLElement) {
    event.currentTarget.blur();
  }
}

function toggleTranslationOnTouch(lineKey: string, event: PointerEvent): void {
  if (event.pointerType !== "touch") return;
  touchStart = null;
  toggleTranslation(lineKey, event);
}

function toggleTranslationOnClick(lineKey: string, event: MouseEvent): void {
  if ((event as PointerEvent).pointerType === "touch") return;
  toggleTranslation(lineKey, event);
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
  const nextElement = event.relatedTarget instanceof Element ? event.relatedTarget : null;
  if (nextElement?.closest(".word-card")) return;
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
  if (!wordElement(event.target)) return;
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
          :class="{ 'is-reading-position': currentParagraphKey === paragraph.key }"
          data-reading-paragraph
          :data-paragraph-key="paragraph.key"
        >
          <template v-for="line in paragraph.lines" :key="line.key">
            <span
              class="reading-line-wrap"
              :class="{ 'is-translation': line.isTranslation }"
              :data-translation-line="line.isTranslation ? line.key : undefined"
            >
            <span
              class="reading-line"
              :class="{ 'translation-mask': line.isTranslation && isTranslationHidden(line.key) }"
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
            >{{ segment.label }}</span>
            </template>
            </span>
            <span
              v-if="line.key === paragraph.lastOriginalLineKey && paragraph.words.length > 0"
              class="reading-paragraph-controls"
              role="group"
              aria-label="段落閱讀操作"
            >
              <button
                class="reading-paragraph-control"
                type="button"
                aria-label="將本段單字標記為認識"
                title="將本段單字標記為認識"
                :disabled="isParagraphKnown(paragraph.words)"
                @pointerdown.stop
                @click.stop="emit('learnParagraph', paragraph.words)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </button>
              <button
                class="reading-paragraph-control"
                :class="{ 'is-active': currentParagraphKey === paragraph.key }"
                type="button"
                aria-label="標記目前閱讀段落"
                title="標記目前閱讀段落"
                :aria-pressed="currentParagraphKey === paragraph.key"
                @pointerdown.stop
                @click.stop="emit('toggleReadingParagraph', paragraph.key)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M6 4h12v16l-6-4-6 4V4Z" />
                </svg>
              </button>
            </span>
            <span v-if="line.isTranslation" class="translation-control-anchor">
              <button
                class="translation-visibility-toggle"
                type="button"
                :aria-label="isTranslationHidden(line.key) ? '顯示這段中文解釋' : '隱藏這段中文解釋'"
                :aria-pressed="isTranslationHidden(line.key)"
                :title="isTranslationHidden(line.key) ? '顯示這段中文解釋' : '隱藏這段中文解釋'"
                @pointerdown.stop="toggleTranslationOnTouch(line.key, $event)"
                @click.stop="toggleTranslationOnClick(line.key, $event)"
              >
                <svg v-if="isTranslationHidden(line.key)" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M3 3 21 21" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11.8 11.8 0 0 1 12 5c5 0 8.5 3.5 10 7a14 14 0 0 1-3.1 4.8M6.2 6.2A13.8 13.8 0 0 0 2 12c1.5 3.5 5 7 10 7a11.8 11.8 0 0 0 2.1-.2" />
                </svg>
                <svg v-else aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M2 12c1.5-3.5 5-7 10-7s8.5 3.5 10 7c-1.5 3.5-5 7-10 7S3.5 15.5 2 12Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              </button>
            </span>
            </span>
          </template>
        </p>
      </template>
      <MaterialImage v-else :block="block.block" />
    </template>
  </div>
</template>
