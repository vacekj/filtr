import { build, bundle, CSP } from "./build";
import { resolve } from "node:path";
const OUT = resolve("artifacts/lab");
await build({ includeModels: false, outdir: OUT });
await bundle("lab/main.ts", OUT + "/lab/main.js");
const html = (await Bun.file("lab/index.html").text())
  .replace("./main.ts", "./main.js")
  .replace("</head>", '<link rel="stylesheet" href="./main.css"></head>');
await Bun.write(OUT + "/lab/index.html", html);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 5181,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path === "/report" && request.method === "POST") {
      const report = await request.text();
      if (report.length > 200000) return new Response("Too large", { status: 413 });
      await Bun.write("artifacts/evaluation.json", JSON.stringify(JSON.parse(report), null, 2));
      return new Response("Saved");
    }
    if (path.split("/").includes("..")) return new Response("Invalid path", { status: 400 });
    const file = Bun.file(
      (path.startsWith("/models/") ? "public" : OUT) +
        (path.endsWith("/") ? path + "index.html" : path),
    );
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "Content-Security-Policy": CSP } });
  },
});
console.log(`Model lab: ${server.url}lab/`);
