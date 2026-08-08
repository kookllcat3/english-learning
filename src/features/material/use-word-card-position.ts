import { onBeforeUnmount, type Ref } from "vue";
import { calculateWordCardTop } from "./word-card-position.js";

const CARD_GAP = 10;
const VIEWPORT_MARGIN = 12;
const MAX_CARD_HEIGHT = 560;
const MINIMUM_VIEWPORT_HEIGHT = 210;

export function useWordCardPosition(
  card: Ref<HTMLElement | null>,
  hoverBridge: Ref<HTMLElement | null>,
): {
  clearAnchor: () => void;
  positionAt: (rect: DOMRect) => void;
} {
  let anchorRect: DOMRect | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function minimumTop(): number {
    const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    return Math.max(VIEWPORT_MARGIN, headerBottom + VIEWPORT_MARGIN);
  }

  function clampedPosition(left: number, top: number): { left: number; top: number } {
    const element = card.value;
    if (!element) return { left, top };
    const rect = element.getBoundingClientRect();
    const topBoundary = minimumTop();
    return {
      left: Math.min(
        window.innerWidth - rect.width - VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, left),
      ),
      top: Math.min(
        Math.max(topBoundary, window.innerHeight - rect.height - VIEWPORT_MARGIN),
        Math.max(topBoundary, top),
      ),
    };
  }

  function setPosition(left: number, top: number): void {
    const element = card.value;
    if (!element) return;
    const position = clampedPosition(left, top);
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
  }

  function positionHoverBridge(targetRect: DOMRect): void {
    const cardElement = card.value;
    const bridgeElement = hoverBridge.value;
    if (!cardElement || !bridgeElement) return;
    const cardRect = cardElement.getBoundingClientRect();
    const cardIsBelowTarget = cardRect.top >= targetRect.bottom;
    const bridgeTop = cardIsBelowTarget ? targetRect.bottom : cardRect.bottom;
    const bridgeBottom = cardIsBelowTarget ? cardRect.top : targetRect.top;
    bridgeElement.style.left = `${cardRect.left}px`;
    bridgeElement.style.top = `${bridgeTop}px`;
    bridgeElement.style.width = `${cardRect.width}px`;
    bridgeElement.style.height = `${Math.max(0, bridgeBottom - bridgeTop)}px`;
  }

  function observeCardSize(): void {
    if (resizeObserver || !card.value) return;
    resizeObserver = new ResizeObserver(() => {
      if (anchorRect) positionAt(anchorRect);
    });
    resizeObserver.observe(card.value);
  }

  function positionAt(rect: DOMRect): void {
    const element = card.value;
    if (!element) return;
    anchorRect = rect;
    observeCardSize();
    const topBoundary = minimumTop();
    const viewportHeight = Math.max(
      MINIMUM_VIEWPORT_HEIGHT,
      window.innerHeight - topBoundary - VIEWPORT_MARGIN,
    );
    element.style.maxHeight = `${Math.min(MAX_CARD_HEIGHT, viewportHeight)}px`;
    const cardRect = element.getBoundingClientRect();
    const top = calculateWordCardTop({
      cardHeight: cardRect.height,
      gap: CARD_GAP,
      margin: VIEWPORT_MARGIN,
      minimumTop: topBoundary,
      targetBottom: rect.bottom,
      targetTop: rect.top,
      viewportHeight: window.innerHeight,
    });
    const left = rect.left + (rect.width - cardRect.width) / 2;
    setPosition(left, top);
    positionHoverBridge(rect);
  }

  function clearAnchor(): void {
    anchorRect = null;
    hoverBridge.value?.style.removeProperty("height");
  }

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return { clearAnchor, positionAt };
}
