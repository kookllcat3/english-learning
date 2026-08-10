import { ref, type Ref } from "vue";

interface ReadingPositionOptions {
  readingContainer: Ref<HTMLElement | null>;
  save: (paragraphKey: string | null) => Promise<boolean>;
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

export function useReadingPosition(options: ReadingPositionOptions) {
  const currentParagraphKey = ref<string | null>(null);
  async function save(paragraphKey: string | null): Promise<void> {
    if (await options.save(paragraphKey)) currentParagraphKey.value = paragraphKey;
  }

  async function returnToPosition(): Promise<void> {
    const paragraphKey = currentParagraphKey.value;
    if (!paragraphKey) return;
    await waitForStableLayout();
    if (currentParagraphKey.value !== paragraphKey) return;

    let paragraph = findReadingParagraph(options.readingContainer.value, paragraphKey);
    if (!paragraph) return;
    const anchor = paragraph.querySelector<HTMLElement>(".reading-anchor__button");
    (anchor ?? paragraph).scrollIntoView({ behavior: "auto", block: "center" });
    await waitForStableLayout();
    if (currentParagraphKey.value !== paragraphKey) return;

    paragraph = findReadingParagraph(options.readingContainer.value, paragraphKey);
    if (!paragraph) return;
    const stableAnchor = paragraph.querySelector<HTMLElement>(".reading-anchor__button");
    (stableAnchor ?? paragraph).scrollIntoView({ behavior: "auto", block: "center" });
    stableAnchor?.focus({ preventScroll: true });
  }

  return {
    currentParagraphKey,
    returnToPosition,
    save,
  };
}
