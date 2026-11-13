import { useEffect, useState } from "react";
import { DEFAULT_FILTER, defaultSettings, loadSettings, type Settings } from "@/src/lib/settings";
import { modelRequest, errorText, type ModelStatus } from "@/src/lib/protocol";

interface BlockedPost {
  id: string;
  text: string;
  probability?: number;
}
function isStatus(value: unknown): value is ModelStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as ModelStatus;
  return (
    ["idle", "loading", "ready", "error"].includes(status.phase) &&
    typeof status.detail === "string"
  );
}
function isPost(value: unknown): value is BlockedPost {
  if (!value || typeof value !== "object") return false;
  const post = value as BlockedPost;
  return typeof post.id === "string" && /^\d+$/.test(post.id) && typeof post.text === "string";
}
export default function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ModelStatus>({ phase: "idle", detail: "Model not loaded" });
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  const [posts, setPosts] = useState<BlockedPost[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadSettings().then((value) => {
      setSettings(value);
      setReady(true);
    });
    void chrome.storage.local
      .get(["MODEL_STATUS", "BLOCKED_COUNT", "BLOCKED_TWEETS"])
      .then((value) => {
        if (isStatus(value.MODEL_STATUS)) setStatus(value.MODEL_STATUS);
        if (typeof value.BLOCKED_COUNT === "number") setCount(value.BLOCKED_COUNT);
        if (Array.isArray(value.BLOCKED_TWEETS)) setPosts(value.BLOCKED_TWEETS.filter(isPost));
      });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (isStatus(changes.MODEL_STATUS?.newValue)) setStatus(changes.MODEL_STATUS.newValue);
      if (typeof changes.BLOCKED_COUNT?.newValue === "number")
        setCount(changes.BLOCKED_COUNT.newValue);
      const posts = changes.BLOCKED_TWEETS?.newValue;
      if (Array.isArray(posts)) setPosts(posts.filter(isPost));
      const active = changes.IS_ACTIVE;
      if (active) setSettings((value) => ({ ...value, IS_ACTIVE: active.newValue === true }));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((value) => ({ ...value, ...patch }));
    setSaved(false);
  };
  async function save() {
    if (!settings.CONTENT_PROMPT.trim()) {
      setError("Describe what you want to hide.");
      return;
    }
    await chrome.storage.local.set(settings);
    setSaved(true);
    setError("");
  }
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (settings.IS_ACTIVE) {
        await chrome.storage.local.set({ IS_ACTIVE: false });
        setSettings((value) => ({ ...value, IS_ACTIVE: false }));
        await modelRequest({ kind: "dispose" });
      } else {
        if (!settings.CONTENT_PROMPT.trim()) throw new Error("Describe what you want to hide.");
        const result = await modelRequest({ kind: "load" });
        if (!result?.ok)
          throw new Error(result && !result.ok ? result.error : "Model is unavailable.");
        const next = { ...settings, IS_ACTIVE: true };
        await chrome.storage.local.set(next);
        setSettings(next);
        setSaved(true);
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <h1>Filtr</h1>
        <span className={settings.IS_ACTIVE ? "badge active" : "badge"}>
          {settings.IS_ACTIVE ? "Filtering" : "Paused"}
        </span>
      </header>
      <label htmlFor="filter">Hide when any condition matches</label>
      <textarea
        id="filter"
        value={settings.CONTENT_PROMPT}
        maxLength={2400}
        rows={9}
        onChange={(event) => update({ CONTENT_PROMPT: event.target.value })}
      />
      <div className="sensitivity">
        <label htmlFor="threshold">Hide above</label>
        <output htmlFor="threshold">{Math.round(settings.HIDE_THRESHOLD * 100)}%</output>
      </div>
      <input
        id="threshold"
        type="range"
        min="10"
        max="99"
        value={Math.round(settings.HIDE_THRESHOLD * 100)}
        onChange={(event) => update({ HIDE_THRESHOLD: Number(event.target.value) / 100 })}
      />
      <div className="actions">
        <button className="primary" disabled={!ready || busy} onClick={() => void toggle()}>
          {busy ? "Loading…" : settings.IS_ACTIVE ? "Pause filtering" : "Start filtering"}
        </button>
        <button disabled={!ready || busy} onClick={() => void save()}>
          {saved ? "Saved" : "Save filter"}
        </button>
      </div>
      <div className="model" role="status">
        <span className={`dot ${status.phase}`} />
        {status.detail}
        {status.lastMs !== undefined && <span>{Math.round(status.lastMs)} ms</span>}
      </div>
      {status.phase === "loading" && (
        <progress max="1" value={status.progress} aria-label="Loading model" />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <details>
        <summary>Topic phrases and limits</summary>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.KEYWORDS_FILTER_ENABLED}
            onChange={(event) => update({ KEYWORDS_FILTER_ENABLED: event.target.checked })}
          />
          Hide keywords
        </label>
        <input
          aria-label="Keywords, separated by commas"
          value={settings.KEYWORDS}
          onChange={(event) => update({ KEYWORDS: event.target.value })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={settings.LIKES_FILTER_ENABLED}
            onChange={(event) => update({ LIKES_FILTER_ENABLED: event.target.checked })}
          />
          Hide popular posts
        </label>
        <input
          aria-label="Maximum likes"
          type="number"
          min="0"
          value={settings.LIKE_THRESHOLD ?? ""}
          onChange={(event) =>
            update({
              LIKE_THRESHOLD: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
        <button className="text-button" onClick={() => update({ CONTENT_PROMPT: DEFAULT_FILTER })}>
          Restore default filter
        </button>
      </details>
      <details>
        <summary>{count.toLocaleString()} posts filtered</summary>
        {posts.length === 0 && <p>No filtered posts yet.</p>}
        <ul>
          {posts.slice(0, 20).map((post, i) => (
            <li key={`${post.id}-${i}`}>
              <a href={`https://x.com/i/status/${post.id}`} target="_blank" rel="noreferrer">
                {post.text}
              </a>
            </li>
          ))}
        </ul>
      </details>
      <footer>Laya multilingual · WebGPU · Stays on this device</footer>
    </main>
  );
}
