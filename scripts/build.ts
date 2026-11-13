import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

export const OUT = resolve(".output/chrome-mv3");
export const CSP = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'";

export async function bundle(entry: string, target: string, format: "esm" | "iife" = "esm") {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: dirname(target),
    target: "browser",
    format,
    naming: target.split("/").at(-1)!.replace(/\.js$/, ".[ext]"),
    minify: true,
    sourcemap: "external",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) throw new AggregateError(result.logs, `Cannot build ${entry}`);
}

export async function build({ includeModels = true, outdir = OUT } = {}) {
  const start = performance.now();
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await Promise.all([
    bundle("entrypoints/content.ts", outdir + "/content.js", "iife"),
    bundle("entrypoints/background.ts", outdir + "/background.js"),
    bundle("entrypoints/offscreen/main.ts", outdir + "/offscreen/main.js"),
    bundle("entrypoints/popup/main.tsx", outdir + "/popup/main.js"),
    bundle("src/inference/model.worker.ts", outdir + "/model.worker.js"),
  ]);
  for (const folder of ["popup", "offscreen"]) {
    const html = await Bun.file(`entrypoints/${folder}/index.html`).text();
    await Bun.write(
      `${outdir}/${folder}/index.html`,
      html
        .replace("./main.tsx", "./main.js")
        .replace("./main.ts", "./main.js")
        .replace(
          "</head>",
          folder === "popup" ? '<link rel="stylesheet" href="./main.css"></head>' : "</head>",
        ),
    );
  }
  const require = createRequire(import.meta.url);
  const runtime = dirname(require.resolve("onnxruntime-web"));
  await mkdir(outdir + "/ort", { recursive: true });
  for (const file of [
    "ort-wasm-simd-threaded.asyncify.mjs",
    "ort-wasm-simd-threaded.asyncify.wasm",
  ]) {
    await cp(runtime + "/" + file, outdir + "/ort/" + file);
  }
  if (includeModels) await cp("public/models/laya", outdir + "/models/laya", { recursive: true });
  await cp("assets/icon.png", outdir + "/icon.png");
  await cp("licenses", outdir + "/licenses", { recursive: true });
  await cp("scripts/laya-artifacts.json", outdir + "/models-provenance.json");
  await Bun.write(
    outdir + "/manifest.json",
    JSON.stringify(
      {
        manifest_version: 3,
        name: "Filtr",
        version: "0.1.0",
        minimum_chrome_version: "116",
        description: "Filter posts on X with an on-device decision model.",
        permissions: ["storage", "offscreen"],
        background: { service_worker: "background.js", type: "module" },
        action: { default_popup: "popup/index.html", default_title: "Filtr" },
        icons: { "16": "icon.png", "48": "icon.png", "128": "icon.png" },
        content_scripts: [
          {
            matches: ["https://x.com/*", "https://twitter.com/*"],
            js: ["content.js"],
            run_at: "document_idle",
          },
        ],
        content_security_policy: { extension_pages: CSP },
      },
      null,
      2,
    ),
  );
  console.log(`Built ${outdir} in ${Math.round(performance.now() - start)} ms`);
}
if (import.meta.main) await build();
