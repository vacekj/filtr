import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { FeedFilter, parseLikes } from "../src/lib/tweetProcessor";
import { defaultSettings } from "../src/lib/settings";
import type { Decision } from "../src/lib/protocol";

let filter: FeedFilter;
let top = 1000;
const active = { ...defaultSettings, IS_ACTIVE: true };
function post(id = "123", text = "A local post") {
  const node = document.createElement("article");
  node.dataset.testid = "tweet";
  node.innerHTML = `<a href="/user/status/${id}"><time>Today</time></a><div data-testid="tweetText"></div>`;
  node.querySelector("[data-testid=tweetText]")!.textContent = text;
  node.getBoundingClientRect = () => ({
    top,
    bottom: top + 200,
    height: 200,
    width: 500,
    left: 0,
    right: 500,
    x: 0,
    y: top,
    toJSON() {},
  });
  document.body.append(node);
  return node;
}
function deferred() {
  let resolve!: (value: Decision) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Decision>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
beforeEach(() => {
  top = 1000;
  document.body.replaceChildren();
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
});
afterEach(() => {
  filter?.stop();
});

describe("feed lookahead", () => {
  it("leaves posts already in view untouched", () => {
    top = 100;
    const node = post();
    const classify = mock();
    filter = new FeedFilter(active, { classify });
    filter.start();
    expect(classify).not.toHaveBeenCalled();
    expect(node.dataset.filtrState).toBeUndefined();
  });
  it("only queues nearby posts below the fold", () => {
    top = 4000;
    post();
    const classify = mock();
    filter = new FeedFilter(active, { classify });
    filter.start();
    expect(classify).not.toHaveBeenCalled();
  });
  it("covers pending text and hides rejected posts before they appear", async () => {
    const node = post();
    const d = deferred();
    const blocked = mock();
    filter = new FeedFilter(active, { classify: () => d.promise, blocked });
    filter.start();
    expect(node.dataset.filtrState).toBe("pending");
    d.resolve({ probability: 0.95, ms: 20 });
    await flush();
    expect(node.dataset.filtrState).toBe("hidden");
    expect(blocked).toHaveBeenCalledTimes(1);
    filter.scan();
    expect(blocked).toHaveBeenCalledTimes(1);
  });
  it("hides a rejected post outright even when it is in view", async () => {
    const node = post();
    const d = deferred();
    filter = new FeedFilter(active, { classify: () => d.promise });
    filter.start();
    top = 400;
    d.resolve({ probability: 0.95, ms: 20 });
    await flush();
    expect(node.dataset.filtrState).toBe("hidden");
    expect(node.querySelector("[data-filtr-cover]")).toBeNull();
  });
  it("restores content on errors and rejects malformed scores", async () => {
    const node = post();
    filter = new FeedFilter(active, { classify: async () => ({ probability: NaN, ms: 1 }) });
    filter.start();
    await flush();
    expect(node.dataset.filtrState).toBeUndefined();
  });
  it("restores pending and hidden posts when paused and discards old results", async () => {
    const node = post();
    const d = deferred();
    filter = new FeedFilter(active, { classify: () => d.promise });
    filter.start();
    filter.update({ ...active, IS_ACTIVE: false });
    d.resolve({ probability: 0.99, ms: 1 });
    await flush();
    expect(node.dataset.filtrState).toBeUndefined();
  });
  it("does not apply a result after the rule changes", async () => {
    const node = post();
    const d = deferred();
    const blocked = mock();
    filter = new FeedFilter(active, { classify: () => d.promise, blocked });
    filter.start();
    filter.update({ ...active, CONTENT_PROMPT: "A different rule" });
    d.resolve({ probability: 0.99, ms: 1 });
    await flush();
    expect(node.dataset.filtrState).toBeUndefined();
    expect(blocked).not.toHaveBeenCalled();
  });
  it("discards results for recycled virtual rows", async () => {
    const node = post();
    const d = deferred();
    const blocked = mock();
    filter = new FeedFilter(active, { classify: () => d.promise, blocked });
    filter.start();
    node.querySelector("a")!.setAttribute("href", "/user/status/456");
    node.querySelector("[data-testid=tweetText]")!.textContent = "Replacement post";
    d.resolve({ probability: 0.99, ms: 1 });
    await flush();
    expect(node.dataset.filtrState).toBeUndefined();
    expect(blocked).not.toHaveBeenCalled();
  });
  it("keeps a rejected post hidden when X recreates its row above the viewport", async () => {
    const node = post();
    const classify = mock(async () => ({ probability: 0.99, ms: 1 }));
    const blocked = mock();
    filter = new FeedFilter(active, { classify, blocked });
    filter.start();
    await flush();
    node.remove();
    filter.scan();
    top = -300;
    const replacement = post();
    filter.scan();
    expect(replacement.dataset.filtrState).toBe("hidden");
    expect(classify).toHaveBeenCalledTimes(1);
    expect(blocked).toHaveBeenCalledTimes(1);
  });
  it("keeps a rejected post hidden when X recreates its row in view", async () => {
    const node = post();
    const classify = mock(async () => ({ probability: 0.99, ms: 1 }));
    filter = new FeedFilter(active, { classify });
    filter.start();
    await flush();
    node.remove();
    filter.scan();
    top = 100;
    const replacement = post();
    filter.scan();
    expect(replacement.dataset.filtrState).toBe("hidden");
    expect(classify).toHaveBeenCalledTimes(1);
  });
  it("invalidates row decisions after filter settings change", async () => {
    const node = post();
    const classify = mock(async () => ({ probability: 0.99, ms: 1 }));
    filter = new FeedFilter(active, { classify });
    filter.start();
    await flush();
    node.remove();
    filter.scan();
    filter.update({ ...active, CONTENT_PROMPT: "Different preference" });
    top = 100;
    const replacement = post();
    filter.scan();
    expect(replacement.dataset.filtrState).toBeUndefined();
  });
  it("times out pending content instead of leaving it invisible", async () => {
    const node = post();
    filter = new FeedFilter(active, { classify: () => new Promise(() => {}), timeoutMs: 100 });
    filter.start();
    await new Promise((resolve) => setTimeout(resolve, 110));
    expect(node.dataset.filtrState).toBeUndefined();
  });
  it("removes covers and preserves pre-existing aria-busy during cleanup", () => {
    const node = post();
    node.setAttribute("aria-busy", "false");
    filter = new FeedFilter(active, { classify: () => new Promise(() => {}) });
    filter.start();
    filter.stop();
    expect(node.getAttribute("aria-busy")).toBe("false");
    expect(node.querySelector("[data-filtr-cover]")).toBeNull();
  });
  it("handles compact counts without treating 1.2K as one like", () => {
    expect(parseLikes("1.2K Likes")).toBe(1200);
    expect(parseLikes("12,345 Likes")).toBe(12345);
  });
});
