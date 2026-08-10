<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  ContentBlock,
  MaterialHighlightAnnotationRecord,
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
  familiarityPresentation,
  type FamiliarityLevel,
  type FamiliarityPresentation,
} from "../familiarity.js";
import MaterialImage from "./MaterialImage.vue";
import ReadingToolbar from "./ReadingToolbar.vue";

interface TextSegment {
  delay?: number;
  label: string;
  word?: string;
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
  annotationBusy: boolean;
  annotationMode: "highlight" | null;
  blocks: ContentBlock[];
  currentParagraphKey: string | null;
  familiarityLevels: FamiliarityLevel[];
  readingProgressBusy: boolean;
  highlights: MaterialHighlightAnnotationRecord[];
  vocabularyProgress: Map<string, VocabularyRecord>;
}>();

const emit = defineEmits<{
  activate: [word: string, rect: DOMRect, key: string, trigger: "hover" | "focus" | "touch"];
  annotateWord: [paragraphKey: string, occurrenceKey: string, mode: "erase" | "highlight"];
  deactivate: [];
  lookup: [word: string, rect: DOMRect, key: string];
  returnToReadingParagraph: [];
  saveReadingParagraph: [paragraphKey: string | null];
  selectAnnotationTool: [mode: "highlight" | null];
}>();
interface AnnotationPointerState {
  lastOccurrenceKey: string;
  lastX: number;
  lastY: number;
  mode: "erase" | "highlight";
  pointerId: number;
}

interface AnnotationTarget {
  occurrenceKey: string;
  paragraphKey: string;
}

const ANNOTATION_STROKE_SAMPLE_INTERVAL_PX = 4;
const COPY_FEEDBACK_DURATION_MS = 3000;
let annotationPointer: AnnotationPointerState | null = null;
let ignoreNextAnnotationClick = false;
let touchStart: { pointerId: number; x: number; y: number } | null = null;
const copySelectionActive = ref(false);
const translationsHidden = ref(false);
const copyFeedback = ref<"error" | "success" | null>(null);
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function setCopyFeedback(status: "error" | "success"): void {
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedback.value = status;
  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = null;
    copyFeedbackTimer = null;
  }, COPY_FEEDBACK_DURATION_MS);
}

async function copyParagraph(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setCopyFeedback("success");
  } catch {
    setCopyFeedback("error");
  }
}

onBeforeUnmount(() => {
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
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
  const presentations = new Map<string, FamiliarityPresentation>();
  renderedBlocks.value.forEach((block) => {
    if (block.type !== "text") return;
    block.paragraphs.forEach((paragraph) => {
      paragraph.lines.forEach((line) => line.segments.forEach((segment) => {
        if (!segment.word || presentations.has(segment.word)) return;
        const materialCount = props.vocabularyProgress.get(segment.word)?.materialCount ?? 0;
        presentations.set(
          segment.word,
          familiarityPresentation(props.familiarityLevels, materialCount),
        );
      }));
    });
  });
  return presentations;
});

const highlightIdByOccurrence = computed(() => new Map(
  props.highlights.flatMap((highlight) => highlight.target.occurrenceKeys.map((occurrenceKey) => (
    [occurrenceKey, highlight.id] as const
  ))),
));

const hasTranslations = computed(() => renderedBlocks.value.some((block) => (
  block.type === "text" && block.paragraphs.some((paragraph) => paragraph.hasTranslation)
)));

function highlightIdFor(occurrenceKey: string): string | undefined {
  return highlightIdByOccurrence.value.get(occurrenceKey);
}

function isHighlightedGap(segments: TextSegment[], segmentIndex: number, lineKey: string): boolean {
  const previous = segments[segmentIndex - 1];
  const next = segments[segmentIndex + 1];
  if (!previous?.word || !next?.word) return false;
  const previousHighlightId = highlightIdFor(`${lineKey}-${segmentIndex - 1}`);
  return Boolean(previousHighlightId)
    && previousHighlightId === highlightIdFor(`${lineKey}-${segmentIndex + 1}`);
}

function presentationFor(segment: TextSegment): FamiliarityPresentation | undefined {
  return segment.word ? wordPresentations.value.get(segment.word) : undefined;
}

function hasFamiliarity(segment: TextSegment): boolean {
  return (presentationFor(segment)?.level.level ?? 0) > 0;
}

function wordElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".reading-word") : null;
}

function paragraphElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-reading-paragraph]")
    : null;
}

function isTranslationTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".reading-line-wrap.is-translation"));
}

function paragraphSourceText(paragraphKey: string): string {
  for (const block of renderedBlocks.value) {
    if (block.type !== "text") continue;
    const paragraph = block.paragraphs.find((candidate) => candidate.key === paragraphKey);
    if (paragraph) return paragraph.sourceText;
  }
  return "";
}

function isAnnotationActiveFor(element: HTMLElement | null): boolean {
  return Boolean(element && props.annotationMode);
}

function annotationTarget(target: EventTarget | null): AnnotationTarget | null {
  const element = wordElement(target);
  const paragraphKey = element?.dataset.paragraphKey;
  const occurrenceKey = element?.dataset.wordKey;
  if (!element || !paragraphKey || !occurrenceKey || !isAnnotationActiveFor(element)) return null;
  return { occurrenceKey, paragraphKey };
}

function annotateWordElement(target: EventTarget | null): boolean {
  const annotation = annotationTarget(target);
  if (!annotation) return false;
  const mode = highlightIdFor(annotation.occurrenceKey) ? "erase" : "highlight";
  emit("annotateWord", annotation.paragraphKey, annotation.occurrenceKey, mode);
  return true;
}

function annotateStrokeTarget(target: EventTarget | null): boolean {
  const annotation = annotationTarget(target);
  if (!annotation) return false;
  if (!annotationPointer) return false;
  if (annotationPointer.lastOccurrenceKey === annotation.occurrenceKey) return true;
  annotationPointer.lastOccurrenceKey = annotation.occurrenceKey;
  emit("annotateWord", annotation.paragraphKey, annotation.occurrenceKey, annotationPointer.mode);
  return true;
}

function activateWordElement(target: EventTarget | null): void {
  const element = wordElement(target);
  if (props.annotationMode || copySelectionActive.value) return;
  const word = element?.dataset.word;
  const key = element?.dataset.wordKey;
  if (element && word && key) emit("activate", word, element.getBoundingClientRect(), key, "focus");
}

function handlePointerOver(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  const element = wordElement(event.target);
  if (props.annotationMode || copySelectionActive.value) return;
  if (!element || element.contains(event.relatedTarget as Node | null)) return;
  const word = element.dataset.word;
  const key = element.dataset.wordKey;
  if (word && key) emit("activate", word, element.getBoundingClientRect(), key, "hover");
}

function handlePointerOut(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  const element = wordElement(event.target);
  if (props.annotationMode || copySelectionActive.value) return;
  if (!element || element.contains(event.relatedTarget as Node | null)) return;
  const nextElement = event.relatedTarget instanceof Element ? event.relatedTarget : null;
  if (nextElement?.closest(".word-card, .word-card-hover-bridge, .reading-word")) return;
  emit("deactivate");
}

function beginPointerInteraction(event: PointerEvent): void {
  const element = wordElement(event.target);
  if (copySelectionActive.value) {
    touchStart = null;
    return;
  }
  if (isAnnotationActiveFor(element) && event.pointerType !== "touch") {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    touchStart = null;
    annotationPointer = {
      lastOccurrenceKey: "",
      lastX: event.clientX,
      lastY: event.clientY,
      mode: highlightIdFor(element?.dataset.wordKey ?? "") ? "erase" : "highlight",
      pointerId: event.pointerId,
    };
    annotateStrokeTarget(element);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    return;
  }
  if (event.pointerType === "mouse") return;
  touchStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
}

function continuePointerInteraction(event: PointerEvent): void {
  if (!annotationPointer || annotationPointer.pointerId !== event.pointerId) return;
  event.preventDefault();
  const distance = Math.hypot(
    event.clientX - annotationPointer.lastX,
    event.clientY - annotationPointer.lastY,
  );
  const sampleCount = Math.max(1, Math.ceil(distance / ANNOTATION_STROKE_SAMPLE_INTERVAL_PX));
  for (let sample = 1; sample <= sampleCount; sample += 1) {
    const progress = sample / sampleCount;
    const x = annotationPointer.lastX + ((event.clientX - annotationPointer.lastX) * progress);
    const y = annotationPointer.lastY + ((event.clientY - annotationPointer.lastY) * progress);
    annotateStrokeTarget(document.elementFromPoint(x, y));
  }
  annotationPointer.lastX = event.clientX;
  annotationPointer.lastY = event.clientY;
}

function finishPointerInteraction(event: PointerEvent): void {
  if (annotationPointer?.pointerId === event.pointerId) {
    event.preventDefault();
    annotationPointer = null;
    ignoreNextAnnotationClick = true;
    setTimeout(() => { ignoreNextAnnotationClick = false; }, 0);
    if (
      event.currentTarget instanceof HTMLElement
      && event.currentTarget.hasPointerCapture(event.pointerId)
    ) event.currentTarget.releasePointerCapture(event.pointerId);
    return;
  }
  if (isAnnotationActiveFor(wordElement(event.target))) return;
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

function cancelPointerInteraction(event: PointerEvent): void {
  if (annotationPointer?.pointerId === event.pointerId) annotationPointer = null;
  if (touchStart?.pointerId === event.pointerId) touchStart = null;
}

function handleDoubleClick(event: MouseEvent): void {
  const element = wordElement(event.target);
  if (props.annotationMode || copySelectionActive.value) return;
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

function handleClick(event: MouseEvent): void {
  if (ignoreNextAnnotationClick) {
    ignoreNextAnnotationClick = false;
    event.preventDefault();
    return;
  }
  if (event.target instanceof Element && event.target.closest(".reading-toolbar, .reading-anchor")) {
    return;
  }
  const paragraph = paragraphElement(event.target);
  if (copySelectionActive.value) {
    if (!paragraph || isTranslationTarget(event.target)) {
      copySelectionActive.value = false;
      return;
    }
    const paragraphKey = paragraph.dataset.paragraphKey;
    if (!paragraphKey) return;
    copySelectionActive.value = false;
    void copyParagraph(paragraphSourceText(paragraphKey));
    event.preventDefault();
    return;
  }
  if (props.annotationMode && (!paragraph || isTranslationTarget(event.target))) {
    emit("selectAnnotationTool", null);
    return;
  }
  if (annotateWordElement(event.target)) event.preventDefault();
}

function clearCopySelection(): void {
  copySelectionActive.value = false;
}

function deactivateTransientTools(): void {
  copySelectionActive.value = false;
  emit("selectAnnotationTool", null);
}

function activateAnchorTool(): void {
  deactivateTransientTools();
  if (props.currentParagraphKey) emit("returnToReadingParagraph");
}

function activateCopyTool(): void {
  emit("selectAnnotationTool", null);
  copySelectionActive.value = !copySelectionActive.value;
  copyFeedback.value = null;
}

function activateHighlightTool(): void {
  copySelectionActive.value = false;
  emit("selectAnnotationTool", props.annotationMode ? null : "highlight");
}

function handleAnchorClick(event: MouseEvent, paragraphKey: string): void {
  event.stopPropagation();
  deactivateTransientTools();
  emit("saveReadingParagraph", props.currentParagraphKey === paragraphKey ? null : paragraphKey);
}

function toggleTranslations(): void {
  deactivateTransientTools();
  translationsHidden.value = !translationsHidden.value;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!copySelectionActive.value) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".reading-toolbar, .reading-anchor")) return;
  if (target?.closest(".reading-content")) return;
  clearCopySelection();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  clearCopySelection();
}

function handleWordKeydown(event: KeyboardEvent): void {
  if (!["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
  if (!wordElement(event.target)) return;
  if (event.key === "Enter" && annotateWordElement(event.target)) {
    event.preventDefault();
    return;
  }
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

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
});

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
    @pointerdown="beginPointerInteraction"
    @pointermove="continuePointerInteraction"
    @pointerup="finishPointerInteraction"
    @pointercancel="cancelPointerInteraction"
    @click="handleClick"
    @dblclick="handleDoubleClick"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
    @keydown="handleWordKeydown"
  >
    <ReadingToolbar
      :annotation-active="annotationMode !== null"
      :annotation-busy="annotationBusy"
      :anchor-busy="readingProgressBusy"
      :anchor-exists="currentParagraphKey !== null"
      :copy-active="copySelectionActive"
      :has-translations="hasTranslations"
      :translations-hidden="translationsHidden"
      @activate-anchor="activateAnchorTool"
      @activate-copy="activateCopyTool"
      @activate-highlight="activateHighlightTool"
      @toggle-translations="toggleTranslations"
    />
    <div
      v-if="copyFeedback"
      class="reading-snackbar"
      :class="{ 'is-error': copyFeedback === 'error' }"
      :role="copyFeedback === 'error' ? 'alert' : 'status'"
      aria-atomic="true"
    >{{ copyFeedback === "success" ? "英文段落已複製" : "複製失敗，請再試一次" }}</div>
    <template v-for="block in renderedBlocks" :key="block.key">
      <template v-if="block.type === 'text'">
        <div
          v-for="paragraph in block.paragraphs"
          :key="paragraph.key"
          class="reading-paragraph"
          :class="{
            'is-anchor-selection-target': paragraph.role === 'source',
            'is-copy-selection-target': copySelectionActive,
          }"
          :data-reading-paragraph="paragraph.role === 'source' ? '' : undefined"
          :data-paragraph-key="paragraph.role === 'source' ? paragraph.key : undefined"
        >
          <span
            v-if="paragraph.role === 'source'"
            class="reading-anchor"
            :class="{ 'is-selected': currentParagraphKey === paragraph.key }"
          >
            <button
              class="reading-anchor__button"
              :class="{ 'is-selected': currentParagraphKey === paragraph.key }"
              type="button"
              :aria-label="currentParagraphKey === paragraph.key
                ? '移除此段閱讀書籤'
                : '將閱讀書籤設在此段'"
              :aria-pressed="currentParagraphKey === paragraph.key"
              :disabled="readingProgressBusy"
              :title="currentParagraphKey === paragraph.key
                ? '移除此段閱讀書籤'
                : '將閱讀書籤移到此段'"
              @click="handleAnchorClick($event, paragraph.key)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M6 3h12v18l-6-4-6 4V3Z" />
              </svg>
            </button>
          </span>
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
                'translation-mask': line.isTranslation && translationsHidden,
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
                'is-highlighted': highlightIdFor(`${line.key}-${segmentIndex}`),
                'is-annotation-target': annotationMode !== null,
                'is-highlight-target': annotationMode !== null
                  && !highlightIdFor(`${line.key}-${segmentIndex}`),
                'is-erase-target': annotationMode !== null
                  && highlightIdFor(`${line.key}-${segmentIndex}`),
              }"
              :data-known-word="segment.word"
              :data-word="segment.word"
              :data-word-key="`${line.key}-${segmentIndex}`"
              :data-paragraph-key="paragraph.key"
              :data-highlight-id="highlightIdFor(`${line.key}-${segmentIndex}`)"
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
              :class="{ 'reading-highlight-gap': isHighlightedGap(line.segments, segmentIndex, line.key) }"
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
