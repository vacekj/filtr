import { LocalModel } from "./model";
import { errorText, type ModelCommand, type ModelReply } from "../lib/protocol";

const model = new LocalModel((status) => self.postMessage({ status }));
let tail: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | undefined;
self.onmessage = (event: MessageEvent<ModelCommand & { id: string; root: string }>) => {
  const request = event.data;
  clearTimeout(idleTimer);
  const operation = tail.then(async () => {
    let reply: ModelReply;
    try {
      if (request.kind === "dispose") await model.dispose();
      else await model.load(request.root);
      reply = {
        ok: true,
        decision:
          request.kind === "classify"
            ? await model.classify(request.text, request.rule)
            : undefined,
      };
    } catch (error) {
      const message = errorText(error);
      reply = { ok: false, error: message };
      self.postMessage({ status: { phase: "error", detail: message } });
    }
    self.postMessage({ id: request.id, reply });
  });
  tail = operation.catch(() => {});
  const current = tail;
  void current.then(() => {
    if (tail !== current) return;
    idleTimer = setTimeout(
      () => {
        tail = tail.then(() => model.dispose()).catch(() => {});
      },
      5 * 60 * 1000,
    );
  });
};
