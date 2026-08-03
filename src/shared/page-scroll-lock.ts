interface ScrollLockSnapshot {
  scrollX: number;
  scrollY: number;
  documentOverflow: string;
  documentOverscrollBehavior: string;
  documentScrollBehavior: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyWidth: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
}

let activeLockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;

function lockViewport(currentSnapshot: ScrollLockSnapshot): void {
  const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  const bodyPaddingRight = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.overscrollBehavior = "none";
  document.documentElement.style.scrollBehavior = "auto";
  document.body.style.position = "fixed";
  document.body.style.top = `${-currentSnapshot.scrollY}px`;
  document.body.style.left = `${-currentSnapshot.scrollX}px`;
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
}

function unlockViewport(currentSnapshot: ScrollLockSnapshot): void {
  document.documentElement.style.overflow = currentSnapshot.documentOverflow;
  document.documentElement.style.overscrollBehavior = currentSnapshot.documentOverscrollBehavior;
  document.body.style.position = currentSnapshot.bodyPosition;
  document.body.style.top = currentSnapshot.bodyTop;
  document.body.style.left = currentSnapshot.bodyLeft;
  document.body.style.width = currentSnapshot.bodyWidth;
  document.body.style.overflow = currentSnapshot.bodyOverflow;
  document.body.style.paddingRight = currentSnapshot.bodyPaddingRight;
  window.scrollTo(currentSnapshot.scrollX, currentSnapshot.scrollY);
  document.documentElement.style.scrollBehavior = currentSnapshot.documentScrollBehavior;
}

/**
 * Locks viewport scrolling while preserving scrollable content inside the active overlay.
 * The returned release function is idempotent and supports nested callers.
 */
export function acquirePageScrollLock(): () => void {
  if (typeof window === "undefined" || !document.body) return () => undefined;

  if (activeLockCount === 0) {
    snapshot = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      documentOverflow: document.documentElement.style.overflow,
      documentOverscrollBehavior: document.documentElement.style.overscrollBehavior,
      documentScrollBehavior: document.documentElement.style.scrollBehavior,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      bodyLeft: document.body.style.left,
      bodyWidth: document.body.style.width,
      bodyOverflow: document.body.style.overflow,
      bodyPaddingRight: document.body.style.paddingRight,
    };
    lockViewport(snapshot);
  }
  activeLockCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeLockCount = Math.max(0, activeLockCount - 1);
    if (activeLockCount !== 0 || !snapshot) return;
    const currentSnapshot = snapshot;
    snapshot = null;
    unlockViewport(currentSnapshot);
  };
}
