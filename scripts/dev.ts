import { watch } from "node:fs";
import { build } from "./build";
await build();
let timer: ReturnType<typeof setTimeout>;
let running = false;
let dirty = false;
async function rebuild() {
  if (running) {
    dirty = true;
    return;
  }
  running = true;
  try {
    await build();
  } catch (error) {
    console.error(error);
  } finally {
    running = false;
    if (dirty) {
      dirty = false;
      void rebuild();
    }
  }
}
for (const dir of ["entrypoints", "src", "assets"])
  watch(dir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 80);
  });
console.log("Watching. Reload Filtr in chrome://extensions after each rebuild.");
