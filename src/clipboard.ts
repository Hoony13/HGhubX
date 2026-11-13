import { isTauri } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyText(text: string): Promise<void> {
  if (isTauri()) {
    await writeText(text);
    return;
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error("현재 환경에서는 복사를 지원하지 않습니다. 앱에서 다시 시도해 주세요");
  }
  await navigator.clipboard.writeText(text);
}
