import type { Settings } from "./settings";
import type { Decision } from "./protocol";
import { matchesKeywords } from "./keywords";

const SELECTOR = 'article[data-testid="tweet"]';
type Phase = "new" | "queued" | "checking" | "keep" | "blocked";
interface Post {
  element: HTMLElement;
  id: string;
  text: string;
  likes: number;
  phase: Phase;
  cover?: HTMLElement;
  timer?: ReturnType<typeof setTimeout>;
  epoch: number;
  previousBusy: string | null;
}
interface Dependencies {
  classify(text: string, rule: string): Promise<Decision>;
  blocked?(post: { id: string; text: string; probability: number }): void;
  error?(message: string): void;
  timeoutMs?: number;
}

async function withDeadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Post check timed out.")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export function parseLikes(value: string): number {
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  const scales: Record<string, number> = { K: 1000, M: 1e6, B: 1e9 };
  return match ? Number(match[1]) * (scales[(match[2] ?? "").toUpperCase()] ?? 1) : 0;
}

export function extractTweetData(element: HTMLElement) {
  const link = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')).find(
    (anchor) => anchor.querySelector("time"),
  );
  const id = link?.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1];
  const texts = Array.from(element.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'));
  const text = texts
    .map((node) => node.textContent?.trim() ?? "")
    .join("\n\n")
    .trim();
  const like = element.querySelector('[data-testid="like"], [data-testid="unlike"]');
  return id && text
    ? { id, text, likes: parseLikes(like?.getAttribute("aria-label") ?? like?.textContent ?? "0") }
    : null;
}

/** Bounded, nearest-first lookahead. Never classify text the user is already reading. */
export class FeedFilter {
  private posts = new Map<HTMLElement, Post>();
  private queue: Post[] = [];
  private running = false;
  private epoch = 0;
  private stopped = false;
  private frame?: number;
  private observer?: MutationObserver;
  private style?: HTMLStyleElement;
  private counted = new Set<string>();
  private decisions = new Map<string, boolean>();
  constructor(
    private settings: Settings,
    private readonly deps: Dependencies,
  ) {}

  start() {
    this.style = document.createElement("style");
    this.style.textContent = `
      [data-filtr-state="hidden"] { display: none !important; }
      [data-filtr-state="pending"] { position: relative !important; min-height: 80px; }
      [data-filtr-state="pending"] > :not([data-filtr-cover]) { visibility: hidden !important; }
      [data-filtr-cover] { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #73818c; font: 14px system-ui; }
    `;
    document.documentElement.append(this.style);
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href"],
    });
    window.addEventListener("scroll", this.schedule, { passive: true });
    window.addEventListener("resize", this.schedule);
    this.scan();
  }

  update(settings: Settings) {
    if (JSON.stringify(settings) === JSON.stringify(this.settings)) return;
    this.settings = settings;
    this.epoch++;
    for (const post of this.posts.values()) this.restore(post);
    this.posts.clear();
    this.decisions.clear();
    this.queue = [];
    this.schedule();
  }

  private schedule = () => {
    if (this.frame !== undefined || this.stopped) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.scan();
    });
  };

  scan() {
    if (this.stopped) return;
    for (const [node, post] of this.posts) {
      if (!node.isConnected) {
        this.restore(post);
        this.posts.delete(node);
      }
    }
    if (!this.settings.IS_ACTIVE) return;
    const height = window.innerHeight;
    for (const element of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      const data = extractTweetData(element);
      let post = this.posts.get(element);
      if (post && (!data || post.id !== data.id || post.text !== data.text)) {
        this.restore(post);
        this.posts.delete(element);
        post = undefined;
      }
      if (!data) continue;
      if (!post) {
        post = {
          element,
          ...data,
          phase: "new",
          epoch: this.epoch,
          previousBusy: element.getAttribute("aria-busy"),
        };
        this.posts.set(element, post);
      }
      const rect = element.getBoundingClientRect();
      if (post.phase !== "new") continue;
      const previous = this.decisions.get(this.decisionKey(post));
      if (previous !== undefined) {
        post.phase = previous ? "blocked" : "keep";
        if (previous) this.hide(post);
        continue;
      }
      // Visible, already-passed and zero-size posts are left alone. Media-only posts have no text.
      if (rect.top < height || rect.height === 0) {
        post.phase = "keep";
        continue;
      }
      if (rect.top > height * 3 || this.queue.length >= 12) continue;
      post.phase = "queued";
      this.cover(post, "Checking…");
      post.timer = setTimeout(() => {
        if (!this.current(post!) || !["queued", "checking"].includes(post!.phase)) return;
        post!.phase = "keep";
        this.restore(post!);
        this.deps.error?.("Some posts could not be checked in time.");
      }, this.deps.timeoutMs ?? 12000);
      this.queue.push(post);
    }
    this.queue = this.queue
      .filter((post) => this.current(post) && post.phase === "queued")
      .sort(
        (a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top,
      );
    void this.pump();
  }

  private current(post: Post) {
    return (
      !this.stopped &&
      post.epoch === this.epoch &&
      post.element.isConnected &&
      this.posts.get(post.element) === post
    );
  }

  private async pump() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const post = this.queue.shift()!;
        if (!this.current(post) || post.phase !== "queued") continue;
        const live = extractTweetData(post.element);
        if (!live || live.id !== post.id || live.text !== post.text) {
          this.restore(post);
          this.posts.delete(post.element);
          this.schedule();
          continue;
        }
        post.phase = "checking";
        const settings = this.settings;
        const keywordMatch =
          settings.KEYWORDS_FILTER_ENABLED && matchesKeywords(post.text, settings.KEYWORDS);
        const likesMatch =
          settings.LIKES_FILTER_ENABLED &&
          settings.LIKE_THRESHOLD !== null &&
          post.likes > settings.LIKE_THRESHOLD;
        try {
          const outcome =
            keywordMatch || likesMatch
              ? { probability: 1, ms: 0 }
              : await withDeadline(
                  this.deps.classify(post.text, settings.CONTENT_PROMPT),
                  this.deps.timeoutMs ?? 12000,
                );
          const latest = extractTweetData(post.element);
          if (
            !this.current(post) ||
            post.phase !== "checking" ||
            latest?.id !== post.id ||
            latest.text !== post.text
          ) {
            if (this.current(post) && latest?.id !== post.id) {
              this.restore(post);
              this.posts.delete(post.element);
              this.schedule();
            }
            continue;
          }
          if (
            !Number.isFinite(outcome.probability) ||
            outcome.probability < 0 ||
            outcome.probability > 1
          ) {
            throw new Error("Invalid model score.");
          }
          clearTimeout(post.timer);
          this.remember(post, outcome.probability >= settings.HIDE_THRESHOLD);
          if (outcome.probability >= settings.HIDE_THRESHOLD) {
            post.phase = "blocked";
            this.hide(post);
            const key = JSON.stringify([post.id, settings.CONTENT_PROMPT]);
            if (!this.counted.has(key)) {
              this.counted.add(key);
              if (this.counted.size > 1000)
                this.counted.delete(this.counted.values().next().value!);
              this.deps.blocked?.({
                id: post.id,
                text: post.text,
                probability: outcome.probability,
              });
            }
          } else {
            post.phase = "keep";
            this.restore(post);
          }
        } catch (error) {
          if (!this.current(post)) continue;
          post.phase = "keep";
          this.restore(post);
          this.deps.error?.(error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      this.running = false;
    }
  }

  private decisionKey(post: Post) {
    return JSON.stringify([post.id, post.text]);
  }

  private remember(post: Post, hide: boolean) {
    const key = this.decisionKey(post);
    this.decisions.delete(key);
    this.decisions.set(key, hide);
    if (this.decisions.size > 500) this.decisions.delete(this.decisions.keys().next().value!);
  }

  private hide(post: Post) {
    this.restore(post);
    post.element.dataset.filtrState = "hidden";
  }

  private cover(post: Post, text: string) {
    post.cover?.remove();
    post.element.dataset.filtrState = "pending";
    post.element.setAttribute("aria-busy", "true");
    const cover = document.createElement("div");
    cover.dataset.filtrCover = "";
    cover.textContent = text;
    cover.setAttribute("role", "status");
    post.element.append(cover);
    post.cover = cover;
  }

  private restore(post: Post) {
    clearTimeout(post.timer);
    post.cover?.remove();
    post.cover = undefined;
    delete post.element.dataset.filtrState;
    if (post.previousBusy === null) post.element.removeAttribute("aria-busy");
    else post.element.setAttribute("aria-busy", post.previousBusy);
  }

  stop() {
    this.stopped = true;
    this.epoch++;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    window.removeEventListener("scroll", this.schedule);
    window.removeEventListener("resize", this.schedule);
    for (const post of this.posts.values()) this.restore(post);
    this.posts.clear();
    this.decisions.clear();
    this.queue = [];
    this.style?.remove();
  }
}
