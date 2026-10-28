/**
 * AgentHub production build: one self-contained executable per platform
 * with the CLI, server, TUI and the web dashboard (HTML import + Tailwind)
 * embedded.
 *
 * Usage:
 *   bun run build              # all targets
 *   bun run build:local        # current platform only (faster)
 */
import twPlugin from "bun-plugin-tailwind";
import type { BunPlugin } from "bun";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/** Ink imports its optional devtools package statically; swap in a no-op stub. */
const stubDevtools: BunPlugin = {
  name: "stub-react-devtools-core",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({ path: resolve("src/tui/devtools-stub.ts") }));
  },
};

const LOCAL_ONLY = Bun.argv.includes("--local");

type Target = "bun-linux-x64" | "bun-linux-arm64" | "bun-darwin-x64" | "bun-darwin-arm64";

const ALL_TARGETS: Array<{ target: Target; outfile: string }> = [
  { target: "bun-linux-x64", outfile: "./binaries/agenthub-linux-x64" },
  { target: "bun-linux-arm64", outfile: "./binaries/agenthub-linux-arm64" },
  { target: "bun-darwin-x64", outfile: "./binaries/agenthub-macos-x64" },
  { target: "bun-darwin-arm64", outfile: "./binaries/agenthub-macos-arm64" },
];

/** Target matching the machine running the build. */
function localTarget(): Target {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return process.platform === "darwin" ? `bun-darwin-${arch}` : `bun-linux-${arch}`;
}

const TARGETS = LOCAL_ONLY ? ALL_TARGETS.filter((t) => t.target === localTarget()) : ALL_TARGETS;

const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

rmSync("./binaries", { recursive: true, force: true });
mkdirSync("./binaries", { recursive: true });

let ok = true;
for (const { target, outfile } of TARGETS) {
  process.stdout.write(`  ${target.padEnd(20)}`);
  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: { target, outfile },
    plugins: [twPlugin, stubDevtools],
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    ok = false;
    console.log("❌");
    for (const log of result.logs) console.error(`      ${log.message}`);
    continue;
  }
  console.log(`✅  ${formatMB(Bun.file(outfile).size)}`);
}

if (!ok) process.exit(1);
console.log("\nBinaries in ./binaries/ — copy one onto your PATH as `agenthub`.");
