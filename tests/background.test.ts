import { expect, it, mock } from "bun:test";
import { registerBackground } from "../entrypoints/background";

it("shares offscreen creation across simultaneous tabs and refuses paused work", async () => {
  let listener: (message: unknown, sender: unknown, response: (reply: unknown) => void) => unknown;
  let active = true;
  const createDocument = mock(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  const sendMessage = mock(async () => ({ ok: true, decision: { probability: 0.8, ms: 1 } }));
  const api = {
    runtime: {
      id: "filtr-test",
      getURL: (path: string) => "chrome-extension://filtr-test" + path,
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
      sendMessage,
    },
    offscreen: { hasDocument: async () => false, createDocument, Reason: { WORKERS: "WORKERS" } },
    storage: { local: { get: async () => ({ IS_ACTIVE: active }) } },
  };
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: api });
  try {
    registerBackground();
    const request = () =>
      new Promise((resolve) =>
        listener!(
          { target: "filtr-background", kind: "classify", text: "Post", rule: "Rule" },
          { id: "filtr-test", tab: { id: 1 }, url: "https://x.com/home" },
          resolve,
        ),
      );
    await Promise.all([request(), request()]);
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    active = false;
    expect(await request()).toEqual({ ok: false, error: "Filtering is paused." });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  } finally {
    Reflect.deleteProperty(globalThis, "chrome");
  }
});
