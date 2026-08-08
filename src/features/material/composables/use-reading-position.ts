import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

import { setMaterialReadingParagraph } from "../../../core/learning/learning-repository.js";
import { errorMessage as getErrorMessage } from "../../../shared/errors.js";

interface ReadingPositionOptions {
  actionError: Ref<string>;
  materialId: () => string;
  readingPanel: Ref<HTMLElement | null>;
  returnActionAnchor: Ref<HTMLElement | null>;
}

function findReadingParagraph(panel: HTMLElement | null, paragraphKey: string): HTMLElement | null {
  return [...(panel?.querySelectorAll<HTMLElement>("[data-paragraph-key]") ?? [])]
    .find((candidate) => candidate.dataset.paragraphKey === paragraphKey) ?? null;
}

function waitForStableLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const FLOATING_ACTION_TOP_PX = 80;

export function useReadingPosition(options: ReadingPositionOptions) {
  const currentParagraphKey = ref<string | null>(null);
  const returnActionFloating = ref(false);
  const showReturnAction = computed(() => currentParagraphKey.value !== null);
  let returnActionObserver: IntersectionObserver | null = null;

  function observeReturnAction(anchor: HTMLElement | null): void {
    returnActionObserver?.disconnect();
    returnActionObserver = null;
    returnActionFloating.value = false;
    if (!anchor || typeof IntersectionObserver === "undefined") return;

    returnActionObserver = new IntersectionObserver(([entry]) => {
      returnActionFloating.value = !entry.isIntersecting
        && entry.boundingClientRect.top < FLOATING_ACTION_TOP_PX;
    }, { rootMargin: `-${FLOATING_ACTION_TOP_PX}px 0px 0px` });
    returnActionObserver.observe(anchor);
  }

  watch(options.returnActionAnchor, observeReturnAction);
  watch(showReturnAction, (visible) => {
    if (!visible) returnActionFloating.value = false;
  });
  onBeforeUnmount(() => returnActionObserver?.disconnect());

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
    await waitForStableLayout();
    if (currentParagraphKey.value !== paragraphKey) return;

    let paragraph = findReadingParagraph(options.readingPanel.value, paragraphKey);
    if (!paragraph) return;
    paragraph.scrollIntoView({ behavior: "auto", block: "center" });
    await waitForStableLayout();
    if (currentParagraphKey.value !== paragraphKey) return;

    paragraph = findReadingParagraph(options.readingPanel.value, paragraphKey);
    if (!paragraph) return;
    paragraph.scrollIntoView({ behavior: "auto", block: "center" });
    paragraph.querySelector<HTMLElement>('[aria-label="標記目前閱讀段落"]')
      ?.focus({ preventScroll: true });
  }

  return {
    currentParagraphKey,
    returnActionFloating,
    returnToPosition,
    showReturnAction,
    toggle,
  };
}
