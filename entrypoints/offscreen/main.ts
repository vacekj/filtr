import type { ModelCommand, ModelReply, ModelStatus } from "@/src/lib/protocol";

let worker: Worker;
const pending = new Map<
  string,
  { resolve: (reply: ModelReply) => void; timer: ReturnType<typeof setTimeout> }
>();
let lastProgress = 0;
function startWorker() {
  worker = new Worker(chrome.runtime.getURL("model.worker.js"), { type: "module" });
  worker.onmessage = (
    event: MessageEvent<{ id?: string; reply?: ModelReply; status?: ModelStatus }>,
  ) => {
    const { id, reply, status } = event.data;
    if (status && (status.phase !== "loading" || Date.now() - lastProgress > 250)) {
      lastProgress = Date.now();
      void chrome.runtime
        .sendMessage({ target: "filtr-background", kind: "status", status })
        .catch(() => {});
    }
    if (id && reply) {
      const request = pending.get(id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(id);
      request.resolve(reply);
    }
  };
  worker.onerror = () => resetWorker("Inference worker stopped. Try loading the model again.");
}
function resetWorker(error: string) {
  worker.terminate();
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.resolve({ ok: false, error });
  }
  pending.clear();
  void chrome.runtime
    .sendMessage({
      target: "filtr-background",
      kind: "status",
      status: { phase: "error", detail: error },
    })
    .catch(() => {});
  startWorker();
}
startWorker();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "filtr-offscreen") return;
  if (pending.size >= 24) {
    sendResponse({ ok: false, error: "Inference queue is full." });
    return;
  }
  const command = message as ModelCommand;
  const id = crypto.randomUUID();
  const timer = setTimeout(() => resetWorker("Model timed out. Try loading it again."), 120000);
  pending.set(id, { resolve: sendResponse, timer });
  worker.postMessage({ ...command, id, root: chrome.runtime.getURL("/") });
  return true;
});
