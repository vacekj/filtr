import { build, OUT } from "./build";
await build();
const process = Bun.spawn(["zip", "-qr", "../filtr.zip", "."], {
  cwd: OUT,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await process.exited) !== 0) throw new Error("Could not create extension ZIP.");
console.log(".output/filtr.zip");
