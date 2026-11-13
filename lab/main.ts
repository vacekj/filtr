import {
  DEFAULT_FILTER,
  DEFAULT_KEYWORDS,
  DEFAULT_THRESHOLD,
  defaultSettings,
} from "../src/lib/settings";
import { FeedFilter } from "../src/lib/tweetProcessor";
import { matchesKeywords } from "../src/lib/keywords";
import { feedCases } from "../tests/fixtures/feed";
import { holdoutCases } from "../tests/fixtures/holdout";
import type { ModelCommand, ModelReply, ModelStatus } from "../src/lib/protocol";
import "./style.css";

const worker = new Worker("/model.worker.js", { type: "module" });
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rule = $<HTMLTextAreaElement>("rule");
rule.value = DEFAULT_FILTER;
const pending = new Map<string, (value: ModelReply) => void>();
worker.onmessage = (event) => {
  const data = event.data as { id?: string; reply?: ModelReply; status?: ModelStatus };
  if (data.status) $("status").textContent = data.status.detail;
  if (data.id && data.reply) {
    pending.get(data.id)?.(data.reply);
    pending.delete(data.id);
  }
};
worker.onerror = (event) => {
  $("status").textContent = event.message;
};
function request(command: ModelCommand): Promise<ModelReply> {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ ...command, id, root: location.origin + "/" });
  });
}
$("load").onclick = async () => {
  $<HTMLButtonElement>("load").disabled = true;
  const result = await request({ kind: "load" });
  if (!result.ok) {
    $("status").textContent = result.error;
    $<HTMLButtonElement>("load").disabled = false;
    return;
  }
  $<HTMLButtonElement>("run").disabled = false;
  $<HTMLButtonElement>("check").disabled = false;
  $<HTMLButtonElement>("feed").disabled = false;
};

$("feed").onclick = () => {
  const main = document.createElement("main");
  main.className = "demo";
  const title = document.createElement("h1");
  title.textContent = "Filtr · Feed scrolling test";
  const status = document.createElement("p");
  status.id = "status";
  status.textContent = "Filtering below the fold";
  main.append(title, status);
  for (const [i, item] of [
    feedCases[0]!,
    feedCases[1]!,
    feedCases[2]!,
    feedCases[15]!,
    feedCases[17]!,
    feedCases[5]!,
    feedCases[8]!,
    feedCases[23]!,
  ].entries()) {
    const article = document.createElement("article");
    article.dataset.testid = "tweet";
    const link = document.createElement("a");
    link.href = "/user/status/" + (1000 + i);
    const time = document.createElement("time");
    time.textContent = "Post " + (i + 1);
    link.append(time);
    const text = document.createElement("div");
    text.dataset.testid = "tweetText";
    text.textContent = item.text;
    article.append(link, text);
    main.append(article);
  }
  document.body.replaceChildren(main);
  const controller = new FeedFilter(
    { ...defaultSettings, IS_ACTIVE: true },
    {
      classify: async (text, rule) => {
        const reply = await request({ kind: "classify", text, rule });
        if (!reply.ok || !reply.decision) throw new Error("Inference failed.");
        return reply.decision;
      },
    },
  );
  controller.start();
  window.addEventListener("pagehide", () => controller.stop(), { once: true });
};
$("check").onclick = async () => {
  const result = await request({
    kind: "classify",
    text: $<HTMLTextAreaElement>("post").value,
    rule: rule.value,
  });
  $("result").textContent = JSON.stringify(result, null, 2);
};
$("run").onclick = async () => {
  $<HTMLButtonElement>("run").disabled = true;
  $("results").replaceChildren();
  const results = [];
  for (const item of [...feedCases, ...holdoutCases]) {
    const result = await request({ kind: "classify", text: item.text, rule: rule.value });
    if (!result.ok || !result.decision) {
      $("summary").textContent = JSON.stringify(result);
      break;
    }
    const { probability: modelScore, ms } = result.decision;
    const phraseMatch = matchesKeywords(item.text, DEFAULT_KEYWORDS);
    const probability = phraseMatch ? 1 : modelScore;
    const correct = probability >= DEFAULT_THRESHOLD === item.hide;
    results.push({ ...item, probability, modelScore, phraseMatch, ms, correct });
    const row = document.createElement("tr");
    for (const value of [
      item.id,
      item.hide ? "hide" : "keep",
      probability.toFixed(4),
      ms.toFixed(1),
      correct ? "PASS" : "FAIL",
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      row.append(td);
    }
    $("results").append(row);
    $("summary").textContent =
      `${results.filter((r) => r.correct).length}/${results.length} correct`;
  }
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const report = {
    correct: results.filter((r) => r.correct).length,
    total: results.length,
    holdoutCorrect: results.slice(feedCases.length).filter((r) => r.correct).length,
    holdoutTotal: holdoutCases.length,
    threshold: DEFAULT_THRESHOLD,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    results,
  };
  $("summary").textContent = JSON.stringify(report, null, 2);
  await fetch("/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  $<HTMLButtonElement>("run").disabled = false;
};
