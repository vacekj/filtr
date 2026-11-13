import { loadSettings, onSettingsChanged } from "@/src/lib/settings";
import { modelRequest } from "@/src/lib/protocol";
import { FeedFilter } from "@/src/lib/tweetProcessor";

async function main() {
  const filter = new FeedFilter(await loadSettings(), {
    classify: async (text, rule) => {
      const reply = await modelRequest({ kind: "classify", text, rule });
      if (!reply?.ok)
        throw new Error(reply && !reply.ok ? reply.error : "Inference is unavailable.");
      if (!reply.decision) throw new Error("Model returned no decision.");
      return reply.decision;
    },
    blocked: (post) => {
      void chrome.runtime
        .sendMessage({ target: "filtr-background", kind: "blocked", ...post })
        .catch(() => {});
    },
    error: (detail) => {
      void chrome.storage.local.set({ FEED_ERROR: detail });
    },
  });
  filter.start();
  const cleanup = onSettingsChanged((settings) => filter.update(settings));
  window.addEventListener(
    "pagehide",
    () => {
      cleanup();
      filter.stop();
    },
    { once: true },
  );
}
void main();
