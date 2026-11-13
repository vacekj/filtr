import { errorText } from "@/src/lib/protocol";
import { loadSettings } from "@/src/lib/settings";

export function registerBackground() {
  let creating: Promise<void> | undefined;
  let recording = Promise.resolve();
  async function ensureOffscreen() {
    if (creating) return creating;
    if (await chrome.offscreen.hasDocument()) return;
    if (creating) return creating;
    creating = chrome.offscreen
      .createDocument({
        url: "offscreen/index.html",
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Run the local feed classifier in a shared WebGPU worker.",
      })
      .finally(() => {
        creating = undefined;
      });
    return creating;
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.target !== "filtr-background") return;
    const fromPopup = sender.url?.startsWith(chrome.runtime.getURL("/"));
    const fromX =
      sender.tab && /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//.test(sender.url ?? "");
    if (!fromPopup && !fromX) return;
    if (message.kind === "status" && fromPopup) {
      void chrome.storage.local.set({ MODEL_STATUS: message.status });
      sendResponse({ ok: true });
      return;
    }
    if (message.kind === "blocked" && fromX) {
      recording = recording
        .then(async () => {
          const stored = await chrome.storage.local.get(["BLOCKED_COUNT", "BLOCKED_TWEETS"]);
          const tweets = Array.isArray(stored.BLOCKED_TWEETS) ? stored.BLOCKED_TWEETS : [];
          await chrome.storage.local.set({
            BLOCKED_COUNT: (Number(stored.BLOCKED_COUNT) || 0) + 1,
            BLOCKED_TWEETS: [
              {
                id: String(message.id).slice(0, 30),
                text: String(message.text).slice(0, 1200),
                timestamp: Date.now(),
                probability: message.probability,
              },
              ...tweets,
            ].slice(0, 50),
          });
        })
        .catch(() => {});
      void recording.then(() => sendResponse({ ok: true }));
      return true;
    }
    if (!["load", "classify", "dispose"].includes(message.kind)) return;
    if (message.kind !== "classify" && !fromPopup) return;
    if (
      message.kind === "classify" &&
      (typeof message.text !== "string" ||
        typeof message.rule !== "string" ||
        message.text.length > 16000 ||
        message.rule.length > 2400)
    ) {
      sendResponse({ ok: false, error: "Post or filter is too long." });
      return;
    }
    void (async () => {
      try {
        if (fromX && !(await loadSettings()).IS_ACTIVE) {
          sendResponse({ ok: false, error: "Filtering is paused." });
          return;
        }
        await ensureOffscreen();
        sendResponse(await chrome.runtime.sendMessage({ ...message, target: "filtr-offscreen" }));
      } catch (error) {
        sendResponse({ ok: false, error: errorText(error) });
      }
    })();
    return true;
  });
}
if (typeof chrome !== "undefined") registerBackground();
