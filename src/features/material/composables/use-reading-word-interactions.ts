import { readingWordElement } from "./reading-content-elements.js";

type ActivationTrigger = "focus" | "hover" | "touch";

interface ReadingWordInteractionOptions {
  isAnnotationActiveFor: (element: HTMLElement | null) => boolean;
  isBlocked: () => boolean;
  isSelectionActive: () => boolean;
  onActivate: (word: string, rect: DOMRect, key: string, trigger: ActivationTrigger) => void;
  onDeactivate: () => void;
  onLookup: (word: string, rect: DOMRect, key: string) => void;
}

interface TouchStart {
  pointerId: number;
  x: number;
  y: number;
}

const TOUCH_TAP_MOVEMENT_LIMIT_PX = 8;

export function useReadingWordInteractions(options: ReadingWordInteractionOptions) {
  let touchStart: TouchStart | null = null;

  function activate(target: EventTarget | null, trigger: ActivationTrigger): void {
    const element = readingWordElement(target);
    if (options.isBlocked()) return;
    const word = element?.dataset.word;
    const key = element?.dataset.wordKey;
    if (element && word && key) {
      options.onActivate(word, element.getBoundingClientRect(), key, trigger);
    }
  }

  function handlePointerOver(event: PointerEvent): void {
    if (event.pointerType === "touch") return;
    const element = readingWordElement(event.target);
    if (options.isBlocked() || !element || element.contains(event.relatedTarget as Node | null)) return;
    activate(element, "hover");
  }

  function handlePointerOut(event: PointerEvent): void {
    if (event.pointerType === "touch") return;
    const element = readingWordElement(event.target);
    if (options.isBlocked() || !element || element.contains(event.relatedTarget as Node | null)) return;
    const nextElement = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (nextElement?.closest(".word-card, .word-card-hover-bridge, .reading-word")) return;
    options.onDeactivate();
  }

  function begin(event: PointerEvent): void {
    if (options.isSelectionActive()) {
      touchStart = null;
      return;
    }
    if (event.pointerType === "mouse") return;
    touchStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function finish(event: PointerEvent): void {
    if (options.isAnnotationActiveFor(readingWordElement(event.target))) return;
    if (!touchStart || touchStart.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
    touchStart = null;
    if (moved <= TOUCH_TAP_MOVEMENT_LIMIT_PX) activate(event.target, "touch");
  }

  function cancel(event: PointerEvent): void {
    if (touchStart?.pointerId === event.pointerId) touchStart = null;
  }

  function handleDoubleClick(event: MouseEvent): void {
    const element = readingWordElement(event.target);
    if (options.isBlocked()) return;
    const word = element?.dataset.word;
    const key = element?.dataset.wordKey;
    if (element && word && key) options.onLookup(word, element.getBoundingClientRect(), key);
  }

  function handleFocusIn(event: FocusEvent): void {
    activate(event.target, "focus");
  }

  function handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Element) || !next.closest(".reading-word")) options.onDeactivate();
  }

  return {
    begin,
    cancel,
    finish,
    handleDoubleClick,
    handleFocusIn,
    handleFocusOut,
    handlePointerOut,
    handlePointerOver,
  };
}
