import { onBeforeUnmount, onMounted, ref } from "vue";

import {
  isReadingTranslationTarget,
  readingParagraphElement,
} from "./reading-content-elements.js";

interface ReadingToolOptions {
  annotationMode: () => "highlight" | null;
  currentParagraphKey: () => string | null;
  onEditTranslation: (paragraphKey: string, sourceText: string, translation: string) => void;
  onReturnToReadingParagraph: () => void;
  onSaveReadingParagraph: (paragraphKey: string | null) => void;
  onSelectAnnotationTool: (mode: "highlight" | null) => void;
  paragraphSourceText: (paragraphKey: string) => string;
  paragraphTranslationText: (paragraphKey: string) => string;
}

const COPY_FEEDBACK_DURATION_MS = 3000;

export function useReadingTools(options: ReadingToolOptions) {
  const copySelectionActive = ref(false);
  const translationSelectionActive = ref(false);
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

  function selectTranslationParagraph(paragraph: HTMLElement): boolean {
    const paragraphKey = paragraph.dataset.paragraphKey;
    if (!paragraphKey) return false;
    options.onEditTranslation(
      paragraphKey,
      options.paragraphSourceText(paragraphKey),
      options.paragraphTranslationText(paragraphKey),
    );
    return true;
  }

  function isSelectionActive(): boolean {
    return copySelectionActive.value || translationSelectionActive.value;
  }

  function handleContentSelectionClick(event: MouseEvent): boolean {
    const paragraph = readingParagraphElement(event.target);
    if (translationSelectionActive.value) {
      if (!paragraph || isReadingTranslationTarget(event.target)) {
        translationSelectionActive.value = false;
        return true;
      }
      if (selectTranslationParagraph(paragraph)) event.preventDefault();
      return true;
    }
    if (!copySelectionActive.value) return false;
    if (!paragraph || isReadingTranslationTarget(event.target)) {
      copySelectionActive.value = false;
      return true;
    }
    const paragraphKey = paragraph.dataset.paragraphKey;
    if (!paragraphKey) return true;
    copySelectionActive.value = false;
    void copyParagraph(options.paragraphSourceText(paragraphKey));
    event.preventDefault();
    return true;
  }

  function clearCopySelection(): void {
    copySelectionActive.value = false;
  }

  function deactivateTransientTools(): void {
    copySelectionActive.value = false;
    translationSelectionActive.value = false;
    options.onSelectAnnotationTool(null);
  }

  function activateAnchorTool(): void {
    deactivateTransientTools();
    if (options.currentParagraphKey()) options.onReturnToReadingParagraph();
  }

  function activateCopyTool(): void {
    options.onSelectAnnotationTool(null);
    translationSelectionActive.value = false;
    copySelectionActive.value = !copySelectionActive.value;
    copyFeedback.value = null;
  }

  function activateHighlightTool(): void {
    copySelectionActive.value = false;
    translationSelectionActive.value = false;
    options.onSelectAnnotationTool(options.annotationMode() ? null : "highlight");
  }

  function activateTranslationEditTool(): void {
    copySelectionActive.value = false;
    options.onSelectAnnotationTool(null);
    translationSelectionActive.value = !translationSelectionActive.value;
  }

  function handleAnchorClick(event: MouseEvent, paragraphKey: string): void {
    event.stopPropagation();
    deactivateTransientTools();
    options.onSaveReadingParagraph(
      options.currentParagraphKey() === paragraphKey ? null : paragraphKey,
    );
  }

  function toggleTranslations(): void {
    deactivateTransientTools();
    translationsHidden.value = !translationsHidden.value;
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (!copySelectionActive.value) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".reading-toolbar, .reading-anchor, .reading-content")) return;
    clearCopySelection();
  }

  function handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    clearCopySelection();
    translationSelectionActive.value = false;
  }

  onMounted(() => {
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeydown);
  });

  onBeforeUnmount(() => {
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("keydown", handleDocumentKeydown);
  });

  return {
    activateAnchorTool,
    activateCopyTool,
    activateHighlightTool,
    activateTranslationEditTool,
    copyFeedback,
    copySelectionActive,
    deactivateTransientTools,
    handleAnchorClick,
    handleContentSelectionClick,
    isSelectionActive,
    selectTranslationParagraph,
    toggleTranslations,
    translationsHidden,
    translationSelectionActive,
  };
}
