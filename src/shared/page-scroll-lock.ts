interface ScrollLockSnapshot {
  scrollY: number;
}

let activeLockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;
let restoringScroll = false;

function isInsideWordCard(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".word-card"));
}

function preventBackgroundScroll(event: Event): void {
  if (!isInsideWordCard(event.target)) event.preventDefault();
}

function preventBackgroundKeyboardScroll(event: KeyboardEvent): void {
  if (isInsideWordCard(event.target)) return;
  if ([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
  }
}

function restoreBackgroundScroll(): void {
  if (!snapshot || restoringScroll || window.scrollY === snapshot.scrollY) return;
  restoringScroll = true;
  window.scrollTo(0, snapshot.scrollY);
  restoringScroll = false;
}

function addScrollGuards(): void {
  document.addEventListener("wheel", preventBackgroundScroll, { capture: true, passive: false });
  document.addEventListener("touchmove", preventBackgroundScroll, { capture: true, passive: false });
  document.addEventListener("keydown", preventBackgroundKeyboardScroll, true);
  window.addEventListener("scroll", restoreBackgroundScroll, { passive: true });
}

function removeScrollGuards(): void {
  document.removeEventListener("wheel", preventBackgroundScroll, true);
  document.removeEventListener("touchmove", preventBackgroundScroll, true);
  document.removeEventListener("keydown", preventBackgroundKeyboardScroll, true);
  window.removeEventListener("scroll", restoreBackgroundScroll);
}

/**
 * Locks page scrolling while a non-dialog overlay is active.
 * The returned release function is idempotent and supports nested callers.
 */
export function acquirePageScrollLock(): () => void {
  if (typeof window === "undefined" || !document.body) return () => undefined;

  if (activeLockCount === 0) {
    snapshot = { scrollY: window.scrollY };
    addScrollGuards();
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
    removeScrollGuards();
    window.scrollTo(0, currentSnapshot.scrollY);
  };
}
