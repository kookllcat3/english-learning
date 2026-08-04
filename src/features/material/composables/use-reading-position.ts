import { computed, ref, type Ref } from "vue";

import { setMaterialReadingParagraph } from "../../../core/learning/learning-repository.js";
import { errorMessage as getErrorMessage } from "../../../shared/errors.js";

interface ReadingPositionOptions {
  actionError: Ref<string>;
  activeView: Ref<"reading" | "vocabulary">;
  materialId: () => string;
  readingPanel: Ref<HTMLElement | null>;
}

function findReadingParagraph(panel: HTMLElement | null, paragraphKey: string): HTMLElement | null {
  return [...(panel?.querySelectorAll<HTMLElement>("[data-paragraph-key]") ?? [])]
    .find((candidate) => candidate.dataset.paragraphKey === paragraphKey) ?? null;
}

function waitForLayout(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function useReadingPosition(options: ReadingPositionOptions) {
  const currentParagraphKey = ref<string | null>(null);
  const showReturnAction = computed(() =>
    options.activeView.value === "reading" && currentParagraphKey.value !== null);

  async function toggle(paragraphKey: string): Promise<void> {
    const previousParagraphKey = currentParagraphKey.value;
    const nextParagraphKey = previousParagraphKey === paragraphKey ? null : paragraphKey;
    currentParagraphKey.value = nextParagraphKey;
    options.actionError.value = "";
    try {
      await setMaterialReadingParagraph(options.materialId(), nextParagraphKey);
    } catch (error) {
      currentParagraphKey.value = previousParagraphKey;
      options.actionError.value = getErrorMessage(error, "無法儲存目前閱讀段落。");
    }
  }

  async function returnToPosition(): Promise<void> {
    const paragraphKey = currentParagraphKey.value;
    if (!paragraphKey) return;
    let paragraph = findReadingParagraph(options.readingPanel.value, paragraphKey);
    if (!paragraph) return;

    paragraph.scrollIntoView({ behavior: "auto", block: "center" });
    await waitForLayout();
    if (currentParagraphKey.value !== paragraphKey) return;

    paragraph = findReadingParagraph(options.readingPanel.value, paragraphKey);
    if (!paragraph) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paragraph.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    paragraph.querySelector<HTMLElement>('[aria-label="標記目前閱讀段落"]')
      ?.focus({ preventScroll: true });
  }

  return {
    currentParagraphKey,
    returnToPosition,
    showReturnAction,
    toggle,
  };
}
