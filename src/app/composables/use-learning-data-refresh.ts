import { onBeforeUnmount, onMounted } from "vue";
import { subscribeToLearningData } from "../../core/learning/learning-sync.js";

interface LearningDataRefreshOptions {
  onHidden?: () => void;
  refresh: () => void;
}

export function useLearningDataRefresh({
  onHidden,
  refresh,
}: LearningDataRefreshOptions): void {
  let unsubscribe = () => {};

  function handleVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      refresh();
      return;
    }
    onHidden?.();
  }

  function handlePageShow(event: PageTransitionEvent): void {
    if (event.persisted) handleVisibilityChange();
  }

  onMounted(() => {
    unsubscribe = subscribeToLearningData(refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
  });

  onBeforeUnmount(() => {
    unsubscribe();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pageshow", handlePageShow);
  });
}
