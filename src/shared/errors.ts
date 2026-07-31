export function errorMessage(error: unknown, fallback = "發生未知錯誤。"): string {
  return error instanceof Error ? error.message : fallback;
}
