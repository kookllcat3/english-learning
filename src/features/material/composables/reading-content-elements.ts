export function readingWordElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".reading-word") : null;
}

export function readingParagraphElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-reading-paragraph]")
    : null;
}

export function isReadingTranslationTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".reading-line-wrap.is-translation"));
}
