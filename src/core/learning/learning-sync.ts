const CHANNEL_NAME = "english-learning-data";
const LOCAL_EVENT_NAME = "english-learning:data-changed";
const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

export interface LearningDataChange {
  type: string;
  timestamp: number;
}

export function notifyLearningDataChanged(type = "progress"): void {
  const detail = { type, timestamp: Date.now() };
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT_NAME, { detail }));
  channel?.postMessage(detail);
}

export function subscribeToLearningData(
  callback: (change: LearningDataChange) => void,
): () => void {
  const handleMessage = (event: MessageEvent<LearningDataChange>) => callback(event.data);
  const handleLocalChange = (event: Event) =>
    callback((event as CustomEvent<LearningDataChange>).detail);
  channel?.addEventListener("message", handleMessage);
  window.addEventListener(LOCAL_EVENT_NAME, handleLocalChange);
  return () => {
    channel?.removeEventListener("message", handleMessage);
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocalChange);
  };
}
