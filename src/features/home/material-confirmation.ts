export function materialUpdateConfirmationMessage(
  fileName: string,
  materialTitle: string,
): string {
  return [
    `要以「${fileName}」更新「${materialTitle}」嗎？`,
    "",
    "教材內容、圖片及閱讀位置會被取代或重設。",
    "無法對應新正文的螢光標記與位置型筆記會被移除。",
    "仍存在於新正文的已認識單字，以及所有教材共用的單字筆記會保留。",
  ].join("\n");
}

export function materialRemovalConfirmationMessage(materialTitle: string): string {
  return [
    `確定要移除「${materialTitle}」嗎？`,
    "",
    "教材內容、圖片、閱讀位置、螢光標記與位置型筆記都會刪除。",
    "共用單字筆記與詞彙紀錄會保留；只在此教材標為已認識的單字，將改為未認識。",
  ].join("\n");
}
