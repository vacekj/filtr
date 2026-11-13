import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import artifact from "./laya-artifacts.json";
for (const [path, metadata] of Object.entries(artifact.files)) {
  const target = "public/models/laya/" + path;
  if (await Bun.file(target).exists()) {
    const bytes = await Bun.file(target).arrayBuffer();
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (hash === metadata.sha256) {
      console.log("Verified", path);
      continue;
    }
    throw new Error(`Existing model file failed verification: ${path}. Move it aside and retry.`);
  }
  console.log("Downloading", path);
  const response = await fetch(
    `https://huggingface.co/${artifact.model}/resolve/${artifact.revision}/${path}`,
  );
  if (!response.ok) throw new Error(`Cannot download ${path}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== metadata.bytes || hash !== metadata.sha256)
    throw new Error(`Model checksum failed: ${path}`);
  await mkdir(dirname(target), { recursive: true });
  await Bun.write(target, bytes);
}
console.log("Model verified.");
