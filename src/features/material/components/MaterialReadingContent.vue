<script setup lang="ts">
import { computed } from "vue";
import type {
  ContentBlock,
  MaterialHighlightAnnotationRecord,
} from "../../../core/models/models.js";
import {
  classifyReadingContent,
  type ReadingTextLine,
  type ReadingTextRole,
} from "../../../core/learning/reading-content.js";
import { normalizeWord } from "../../../core/text/text.js";
import {
  isReadingTranslationTarget,
  readingParagraphElement,
  readingWordElement,
} from "../composables/reading-content-elements.js";
import { useAnnotationPointerInteractions } from "../composables/use-annotation-pointer-interactions.js";
import { useReadingTools } from "../composables/use-reading-tools.js";
import { useReadingWordInteractions } from "../composables/use-reading-word-interactions.js";
import MaterialImage from "./MaterialImage.vue";
import ReadingToolbar from "./ReadingToolbar.vue";

interface TextSegment {
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
  readingProgressBusy: boolean;
  highlights: MaterialHighlightAnnotationRecord[];
}>();

const emit = defineEmits<{
  activate: [word: string, rect: DOMRect, key: string, trigger: "hover" | "focus" | "touch"];
  annotateWord: [paragraphKey: string, occurrenceKey: string, mode: "erase" | "highlight"];
  deactivate: [];
  editTranslation: [paragraphKey: string, sourceText: string, translation: string];
  lookup: [word: string, rect: DOMRect, key: string];
  returnToReadingParagraph: [];
  saveReadingParagraph: [paragraphKey: string | null];
  selectAnnotationTool: [mode: "highlight" | null];
}>();

function textSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const wordPattern = /[a-z]+(?:['’][a-z]+)*/gi;
  let cursor = 0;
  for (const match of text.matchAll(wordPattern)) {
    if (match.index > cursor) segments.push({ label: text.slice(cursor, match.index) });
    const normalizedWord = normalizeWord(match[0]);
    segments.push({
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

function paragraphSourceText(paragraphKey: string): string {
  for (const block of renderedBlocks.value) {
    if (block.type !== "text") continue;
    const paragraph = block.paragraphs.find((candidate) => candidate.key === paragraphKey);
    if (paragraph) return paragraph.sourceText;
  }
  return "";
}

function paragraphTranslationText(paragraphKey: string): string {
  for (const block of renderedBlocks.value) {
    if (block.type !== "text") continue;
    const paragraph = block.paragraphs.find((candidate) => candidate.key === paragraphKey);
    if (!paragraph) continue;
    return paragraph.lines
      .filter((line) => line.isTranslation)
      .flatMap((line) => line.segments.map((segment) => segment.label))
      .join("\n");
  }
  return "";
}

function isWordInteractionBlocked(): boolean {
  return Boolean(
    props.annotationMode
    || copySelectionActive.value
    || translationSelectionActive.value,
  );
}

const {
  activateAnchorTool,
  activateCopyTool,
  activateHighlightTool,
  activateTranslationEditTool,
  copyFeedback,
  copySelectionActive,
  handleAnchorClick,
  handleContentSelectionClick,
  isSelectionActive,
  selectTranslationParagraph,
  toggleTranslations,
  translationsHidden,
  translationSelectionActive,
} = useReadingTools({
  annotationMode: () => props.annotationMode,
  currentParagraphKey: () => props.currentParagraphKey,
  onEditTranslation: (paragraphKey, sourceText, translation) => {
    emit("editTranslation", paragraphKey, sourceText, translation);
  },
  onReturnToReadingParagraph: () => emit("returnToReadingParagraph"),
  onSaveReadingParagraph: (paragraphKey) => emit("saveReadingParagraph", paragraphKey),
  onSelectAnnotationTool: (mode) => emit("selectAnnotationTool", mode),
  paragraphSourceText,
  paragraphTranslationText,
});

const annotationInteractions = useAnnotationPointerInteractions({
  annotationMode: () => props.annotationMode,
  highlightIdFor,
  isSelectionActive,
  onAnnotate: (paragraphKey, occurrenceKey, mode) => {
    emit("annotateWord", paragraphKey, occurrenceKey, mode);
  },
});

const {
  begin: beginWordPointerInteraction,
  cancel: cancelWordPointerInteraction,
  finish: finishWordPointerInteraction,
  handleDoubleClick,
  handleFocusIn,
  handleFocusOut,
  handlePointerOut,
  handlePointerOver,
} = useReadingWordInteractions({
  isAnnotationActiveFor: annotationInteractions.isActiveFor,
  isBlocked: isWordInteractionBlocked,
  isSelectionActive,
  onActivate: (word, rect, key, trigger) => emit("activate", word, rect, key, trigger),
  onDeactivate: () => emit("deactivate"),
  onLookup: (word, rect, key) => emit("lookup", word, rect, key),
});

function beginPointerInteraction(event: PointerEvent): void {
  if (!annotationInteractions.begin(event)) beginWordPointerInteraction(event);
}

function continuePointerInteraction(event: PointerEvent): void {
  annotationInteractions.move(event);
}

function finishPointerInteraction(event: PointerEvent): void {
  if (!annotationInteractions.finish(event)) finishWordPointerInteraction(event);
}

function cancelPointerInteraction(event: PointerEvent): void {
  annotationInteractions.cancel(event);
  cancelWordPointerInteraction(event);
}

function handleClick(event: MouseEvent): void {
  if (annotationInteractions.consumeIgnoredClick(event)) return;
  if (event.target instanceof Element && event.target.closest(".reading-toolbar, .reading-anchor")) {
    return;
  }
  if (handleContentSelectionClick(event)) return;
  const paragraph = readingParagraphElement(event.target);
  if (props.annotationMode && (!paragraph || isReadingTranslationTarget(event.target))) {
    emit("selectAnnotationTool", null);
    return;
  }
  if (annotationInteractions.annotateWord(event.target)) event.preventDefault();
}

function handleWordKeydown(event: KeyboardEvent): void {
  if (
    event.key === "Enter"
    && translationSelectionActive.value
    && event.target instanceof HTMLElement
    && event.target.matches("[data-reading-paragraph]")
  ) {
    if (selectTranslationParagraph(event.target)) event.preventDefault();
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
  if (!readingWordElement(event.target)) return;
  if (event.key === "Enter" && annotationInteractions.annotateWord(event.target)) {
    event.preventDefault();
    return;
  }
  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) return;
  const words = [...container.querySelectorAll<HTMLElement>(".reading-word")];
  if (words.length === 0) return;
  const current = readingWordElement(event.target);
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
      :translation-edit-active="translationSelectionActive"
      @activate-anchor="activateAnchorTool"
      @activate-copy="activateCopyTool"
      @activate-highlight="activateHighlightTool"
      @activate-translation-edit="activateTranslationEditTool"
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
            'is-translation-selection-target': translationSelectionActive,
          }"
          :tabindex="paragraph.role === 'source' && translationSelectionActive ? 0 : undefined"
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
              tabindex="-1"
            >{{ segment.label }}</span>
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
