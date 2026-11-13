export interface ModelStatus {
  phase: "idle" | "loading" | "ready" | "error";
  detail: string;
  progress?: number;
  lastMs?: number;
}
export interface Decision {
  probability: number;
  ms: number;
}
export type ModelCommand =
  | { kind: "load" }
  | { kind: "classify"; text: string; rule: string }
  | { kind: "dispose" };
export type ModelReply = { ok: true; decision?: Decision } | { ok: false; error: string };
export async function modelRequest(command: ModelCommand): Promise<ModelReply> {
  return chrome.runtime.sendMessage({ target: "filtr-background", ...command });
}
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
