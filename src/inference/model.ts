import * as ort from "onnxruntime-web/webgpu";
import { PreTrainedTokenizer } from "@huggingface/transformers";
import type { Decision, ModelStatus } from "../lib/protocol";

export class LocalModel {
  private session?: ort.InferenceSession;
  private tokenizer?: PreTrainedTokenizer;
  private loading?: Promise<void>;
  private cache = new Map<string, Decision>();
  constructor(private readonly report: (status: ModelStatus) => void = () => {}) {}

  async load(root: string): Promise<void> {
    if (this.session) return;
    if (!this.loading)
      this.loading = (async () => {
        this.report({ phase: "loading", detail: "Loading Laya multilingual · 322M · FP16" });
        const gpu = navigator.gpu;
        if (!gpu || !(await gpu.requestAdapter())?.features.has("shader-f16")) {
          throw new Error("This model needs a browser with WebGPU and shader-f16 support.");
        }
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = {
          mjs: new URL("ort/ort-wasm-simd-threaded.asyncify.mjs", root).href,
          wasm: new URL("ort/ort-wasm-simd-threaded.asyncify.wasm", root).href,
        };
        const base = new URL("models/laya/", root);
        const read = async (file: string) => {
          const response = await fetch(new URL(file, base));
          if (!response.ok)
            throw new Error(`Cannot load model file: ${file} (${response.status}).`);
          return response;
        };
        const [tokenizer, config, graph, weights] = await Promise.all([
          read("tokenizer.json").then((r) => r.json()),
          read("tokenizer_config.json").then((r) => r.json()),
          read("onnx/model_fp16.onnx").then((r) => r.arrayBuffer()),
          read("onnx/model_fp16.onnx_data").then((r) => r.arrayBuffer()),
        ]);
        this.tokenizer = new PreTrainedTokenizer(tokenizer, config);
        this.report({ phase: "loading", detail: "Compiling WebGPU shaders…" });
        this.session = await ort.InferenceSession.create(graph, {
          executionProviders: ["webgpu"],
          graphOptimizationLevel: "basic",
          externalData: [{ path: "model_fp16.onnx_data", data: new Uint8Array(weights) }],
        });
        this.report({ phase: "ready", detail: "Laya multilingual · WebGPU" });
      })().finally(() => {
        this.loading = undefined;
      });
    return this.loading;
  }

  async classify(text: string, rule: string): Promise<Decision> {
    if (!this.session || !this.tokenizer) throw new Error("Model is not loaded.");
    const rules = rule
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!text.trim() || !rules.length) throw new Error("Post and filter must not be empty.");
    if (rules.length > 12) throw new Error("Use at most 12 filter conditions.");
    const key = JSON.stringify([rule, text]);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const start = performance.now();
    // mmBERT's Metaspace tokenizer: match the reference's word-at-a-time browser port.
    const raw = (value: string) => this.tokenizer!.encode(value, { add_special_tokens: false });
    const encode = (value: string) => {
      const clean = value.replaceAll("<mask>", " ");
      const spaced = clean.startsWith(" ") ? clean : " " + clean;
      return spaced
        .split(/(?= )/)
        .flatMap((piece) => (piece.slice(1) === "" ? raw(" ") : raw(piece.slice(1))));
    };
    const state = encode(text);
    const sequences = rules.map((question) => {
      const head = encode("noul question: " + question);
      if (head.length > 200) throw new Error("Filter condition is too long.");
      const ids = [2, ...head, 1];
      const markers = [ids.length];
      ids.push(4, ...encode(" false: no, the statement does not hold"));
      markers.push(ids.length);
      ids.push(4, ...encode(" true: yes, the statement holds"), 1, ...state, 1);
      if (ids.length > 1024) throw new Error("Post or filter exceeds the model token limit.");
      return { ids, markers };
    });
    const length = Math.max(...sequences.map((row) => row.ids.length));
    const batch = sequences.length;
    const ids = new BigInt64Array(batch * length);
    const mask = new BigInt64Array(batch * length);
    const markers = new BigInt64Array(batch * 2);
    sequences.forEach((row, i) => {
      row.ids.forEach((id, j) => {
        ids[i * length + j] = BigInt(id);
        mask[i * length + j] = 1n;
      });
      row.markers.forEach((position, j) => {
        markers[i * 2 + j] = BigInt(position);
      });
    });
    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor("int64", ids, [batch, length]),
      attention_mask: new ort.Tensor("int64", mask, [batch, length]),
      marker_pos: new ort.Tensor("int64", markers, [batch, 2]),
      marker_mask: new ort.Tensor("bool", new Uint8Array(batch * 2).fill(1), [batch, 2]),
      qtype: new ort.Tensor("int64", new BigInt64Array(batch).fill(2n), [batch]),
    };
    let output: ort.InferenceSession.ReturnType | undefined;
    try {
      output = await this.session.run(feeds);
      const logits = (await output.logits!.getData()) as Float32Array;
      let probability = 0;
      for (let i = 0; i < rules.length; i++) {
        const entailment = Number(logits[i * 2 + 1]);
        const contradiction = Number(logits[i * 2]);
        probability = Math.max(probability, 1 / (1 + Math.exp(contradiction - entailment)));
      }
      if (!Number.isFinite(probability)) throw new Error("Invalid model score.");
      const decision = { probability, ms: performance.now() - start };
      this.cache.set(key, decision);
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
      this.report({ phase: "ready", detail: "Laya multilingual · WebGPU", lastMs: decision.ms });
      return decision;
    } finally {
      Object.values(feeds).forEach((tensor) => tensor.dispose());
      if (output) Object.values(output).forEach((tensor) => tensor.dispose());
    }
  }

  async dispose() {
    await this.loading;
    await this.session?.release();
    this.session = undefined;
    this.tokenizer = undefined;
    this.cache.clear();
    this.report({ phase: "idle", detail: "Model unloaded" });
  }
}
