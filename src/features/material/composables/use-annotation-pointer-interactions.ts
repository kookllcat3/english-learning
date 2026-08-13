import { readingWordElement } from "./reading-content-elements.js";

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

interface AnnotationPointerOptions {
  annotationMode: () => "highlight" | null;
  highlightIdFor: (occurrenceKey: string) => string | undefined;
  isSelectionActive: () => boolean;
  onAnnotate: (
    paragraphKey: string,
    occurrenceKey: string,
    mode: "erase" | "highlight",
  ) => void;
}

const STROKE_SAMPLE_INTERVAL_PX = 4;

export function useAnnotationPointerInteractions(options: AnnotationPointerOptions) {
  let pointer: AnnotationPointerState | null = null;
  let ignoreNextClick = false;

  function isActiveFor(element: HTMLElement | null): boolean {
    return Boolean(element && options.annotationMode());
  }

  function annotationTarget(target: EventTarget | null): AnnotationTarget | null {
    const element = readingWordElement(target);
    const paragraphKey = element?.dataset.paragraphKey;
    const occurrenceKey = element?.dataset.wordKey;
    if (!element || !paragraphKey || !occurrenceKey || !isActiveFor(element)) return null;
    return { occurrenceKey, paragraphKey };
  }

  function annotateWord(target: EventTarget | null): boolean {
    const annotation = annotationTarget(target);
    if (!annotation) return false;
    const mode = options.highlightIdFor(annotation.occurrenceKey) ? "erase" : "highlight";
    options.onAnnotate(annotation.paragraphKey, annotation.occurrenceKey, mode);
    return true;
  }

  function annotateStrokeTarget(target: EventTarget | null): boolean {
    const annotation = annotationTarget(target);
    if (!annotation || !pointer) return false;
    if (pointer.lastOccurrenceKey === annotation.occurrenceKey) return true;
    pointer.lastOccurrenceKey = annotation.occurrenceKey;
    options.onAnnotate(annotation.paragraphKey, annotation.occurrenceKey, pointer.mode);
    return true;
  }

  function begin(event: PointerEvent): boolean {
    const element = readingWordElement(event.target);
    if (options.isSelectionActive() || !isActiveFor(element) || event.pointerType === "touch") {
      return false;
    }
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return true;
    event.preventDefault();
    pointer = {
      lastOccurrenceKey: "",
      lastX: event.clientX,
      lastY: event.clientY,
      mode: options.highlightIdFor(element?.dataset.wordKey ?? "") ? "erase" : "highlight",
      pointerId: event.pointerId,
    };
    annotateStrokeTarget(element);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    return true;
  }

  function move(event: PointerEvent): void {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    const distance = Math.hypot(event.clientX - pointer.lastX, event.clientY - pointer.lastY);
    const sampleCount = Math.max(1, Math.ceil(distance / STROKE_SAMPLE_INTERVAL_PX));
    for (let sample = 1; sample <= sampleCount; sample += 1) {
      const progress = sample / sampleCount;
      const x = pointer.lastX + ((event.clientX - pointer.lastX) * progress);
      const y = pointer.lastY + ((event.clientY - pointer.lastY) * progress);
      annotateStrokeTarget(document.elementFromPoint(x, y));
    }
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
  }

  function finish(event: PointerEvent): boolean {
    if (pointer?.pointerId === event.pointerId) {
      event.preventDefault();
      pointer = null;
      ignoreNextClick = true;
      setTimeout(() => { ignoreNextClick = false; }, 0);
      if (
        event.currentTarget instanceof HTMLElement
        && event.currentTarget.hasPointerCapture(event.pointerId)
      ) event.currentTarget.releasePointerCapture(event.pointerId);
      return true;
    }
    return isActiveFor(readingWordElement(event.target));
  }

  function cancel(event: PointerEvent): void {
    if (pointer?.pointerId === event.pointerId) pointer = null;
  }

  function consumeIgnoredClick(event: MouseEvent): boolean {
    if (!ignoreNextClick) return false;
    ignoreNextClick = false;
    event.preventDefault();
    return true;
  }

  return {
    annotateWord,
    begin,
    cancel,
    consumeIgnoredClick,
    finish,
    isActiveFor,
    move,
  };
}
