import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// The managed preview CLI uses Vite-style flags. Translate just those flags;
// normal Next.js development arguments are passed through without a shell.
const require = createRequire(import.meta.url);
const args = process.argv.slice(2).flatMap((argument) => {
  if (argument === "--strictPort" || argument.startsWith("--strictPort="))
    return [];
  if (argument === "--host") return ["--hostname"];
  if (argument.startsWith("--host=")) return ["--hostname", argument.slice(7)];
  return [argument];
});
if (
  !args.includes("--hostname") &&
  !args.some((arg) => arg.startsWith("--hostname="))
)
  args.push("--hostname", "0.0.0.0");
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", ...args],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
