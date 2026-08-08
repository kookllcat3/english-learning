<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type {
  ContentBlock,
  VocabularyRecord,
} from "../../../core/models/models.js";
import {
  classifyReadingContent,
  type ReadingTextLine,
  type ReadingTextRole,
} from "../../../core/learning/reading-content.js";
import { normalizeWord } from "../../../core/text/text.js";
import {
  familiarityDelay,
  familiarityLevel,
  type FamiliarityLevel,
} from "../familiarity.js";
import MaterialImage from "./MaterialImage.vue";
import ParagraphToolbar from "./ParagraphToolbar.vue";

interface TextSegment {
  delay?: number;
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
    hasTranslation: boolean;
    key: string;
    lines: Array<{
      isSource: boolean;
      isTranslation: boolean;
      key: string;
      segments: TextSegment[];
    }>;
    role: ReadingTextRole;
    sourceText: string;
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
  lookup: [word: string, rect: DOMRect, key: string];
  toggleReadingParagraph: [paragraphKey: string];
}>();
let touchStart: { pointerId: number; x: number; y: number } | null = null;
const hiddenTranslationParagraphs = ref(new Set<string>());
const copyFeedback = ref<{ key: string; status: "error" | "success" } | null>(null);
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function setCopyFeedback(key: string, status: "error" | "success"): void {
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedback.value = { key, status };
  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = null;
    copyFeedbackTimer = null;
  }, 1600);
}

async function copyParagraph(key: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setCopyFeedback(key, "success");
  } catch {
    setCopyFeedback(key, "error");
  }
}

onBeforeUnmount(() => {
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
});

function textSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const wordPattern = /[a-z]+(?:['’][a-z]+)*/gi;
  let cursor = 0;
  for (const match of text.matchAll(wordPattern)) {
    if (match.index > cursor) segments.push({ label: text.slice(cursor, match.index) });
    const normalizedWord = normalizeWord(match[0]);
    segments.push({
      delay: familiarityDelay(normalizedWord),
      label: match[0],
      word: normalizedWord,
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ label: text.slice(cursor) });
  return segments;
}

function lineSegments(line: ReadingTextLine): TextSegment[] {
  if (line.role !== "source") {
    return [{ label: line.text }];
  }
  const prefix = line.text.slice(0, line.interactiveTextStart);
  return [
    ...(prefix ? [{ label: prefix }] : []),
    ...textSegments(line.text.slice(line.interactiveTextStart)),
  ];
}

const renderedBlocks = computed<Array<RenderedTextBlock | RenderedImageBlock>>(() =>
  classifyReadingContent(props.blocks).map((section) => {
    if (section.type === "image") return section;
    return {
      key: section.key,
      type: "text",
      paragraphs: [{
        hasTranslation: section.lines.some((line) => line.role === "translation"),
        key: section.key,
        lines: section.lines.map((line) => ({
          isSource: line.role === "source",
          isTranslation: line.role === "translation",
          key: line.key,
          segments: lineSegments(line),
        })),
        role: section.role,
        sourceText: section.lines
          .filter((line) => line.role === "source")
          .map((line) => line.text.trim())
          .filter(Boolean)
          .join("\n"),
        words: section.words,
      }],
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

function isTranslationHidden(paragraphKey: string): boolean {
  return hiddenTranslationParagraphs.value.has(paragraphKey);
}

function toggleTranslation(paragraphKey: string): void {
  const nextHiddenParagraphs = new Set(hiddenTranslationParagraphs.value);
  if (nextHiddenParagraphs.has(paragraphKey)) nextHiddenParagraphs.delete(paragraphKey);
  else nextHiddenParagraphs.add(paragraphKey);
  hiddenTranslationParagraphs.value = nextHiddenParagraphs;
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
  if (nextElement?.closest(".word-card, .word-card-hover-bridge, .reading-word")) return;
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
  const key = element?.dataset.wordKey;
  if (element && word && key) emit("lookup", word, element.getBoundingClientRect(), key);
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
    aria-label="教材內容閱讀區"
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
        <div
          v-for="paragraph in block.paragraphs"
          :key="paragraph.key"
          class="reading-paragraph"
          :data-reading-paragraph="paragraph.role === 'source' ? '' : undefined"
          :data-paragraph-key="paragraph.role === 'source' ? paragraph.key : undefined"
        >
          <ParagraphToolbar
            v-if="paragraph.words.length > 0"
            :copy-status="copyFeedback?.key === paragraph.key ? copyFeedback.status : null"
            :has-translation="paragraph.hasTranslation"
            :is-current-reading-position="currentParagraphKey === paragraph.key"
            :is-translation-hidden="isTranslationHidden(paragraph.key)"
            @copy="copyParagraph(paragraph.key, paragraph.sourceText)"
            @toggle-reading-position="emit('toggleReadingParagraph', paragraph.key)"
            @toggle-translation="toggleTranslation(paragraph.key)"
          />
          <template v-for="line in paragraph.lines" :key="line.key">
            <span
              class="reading-line-wrap"
              :class="{
                'is-reading-position': line.isSource && currentParagraphKey === paragraph.key,
                'is-translation': line.isTranslation,
              }"
              :data-translation-line="line.isTranslation ? line.key : undefined"
              :data-source-line-key="line.isSource ? line.key : undefined"
            >
            <span
              class="reading-line"
              :class="{
                'translation-mask': line.isTranslation && isTranslationHidden(paragraph.key),
              }"
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
            </span>
          </template>
        </div>
      </template>
      <MaterialImage v-else :block="block.block" />
    </template>
  </div>
</template>
