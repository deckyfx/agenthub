/**
 * AgentHub production build script.
 *
 * Stage 1 — web assets: compiles React + Tailwind CSS to ./dist/
 * Stage 2 — binaries: compiles CLI + server + embedded assets for each platform
 *
 * Usage:
 *   bun run build              # all targets
 *   bun run build:local        # current platform only (faster)
 */
import twPlugin from "bun-plugin-tailwind";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ─── Config ───────────────────────────────────────────────────────────────────

const LOCAL_ONLY = Bun.argv.includes("--local");

type BunCrossTarget =
  | "bun-linux-x64"
  | "bun-linux-arm64"
  | "bun-darwin-x64"
  | "bun-darwin-arm64"
  | "bun-windows-x64";

const ALL_TARGETS: Array<{ target: BunCrossTarget; outfile: string }> = [
  { target: "bun-linux-x64",    outfile: "./binaries/agenthub-linux-x64"        },
  { target: "bun-linux-arm64",  outfile: "./binaries/agenthub-linux-arm64"      },
  { target: "bun-darwin-x64",   outfile: "./binaries/agenthub-macos-x64"        },
  { target: "bun-darwin-arm64", outfile: "./binaries/agenthub-macos-arm64"      },
  { target: "bun-windows-x64",  outfile: "./binaries/agenthub-windows-x64.exe"  },
];

// Detect current platform for --local builds
function localTarget(): BunCrossTarget {
  const os = process.platform;
  const arch = process.arch;
  if (os === "linux"  && arch === "x64")   return "bun-linux-x64";
  if (os === "linux"  && arch === "arm64") return "bun-linux-arm64";
  if (os === "darwin" && arch === "x64")   return "bun-darwin-x64";
  if (os === "darwin" && arch === "arm64") return "bun-darwin-arm64";
  if (os === "win32")                       return "bun-windows-x64";
  return "bun-linux-x64";
}

const TARGETS = LOCAL_ONLY
  ? ALL_TARGETS.filter((t) => t.target === localTarget())
  : ALL_TARGETS;

const DEFINE = {
  "process.env.NODE_ENV": JSON.stringify("production"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Stage 1: Web assets ──────────────────────────────────────────────────────

console.log("📦 Stage 1 — building web assets...\n");

rmSync("./dist", { recursive: true, force: true });
mkdirSync("./dist", { recursive: true });

const webResult = await Bun.build({
  entrypoints: ["./src/server/public/index.tsx"],
  outdir: "./dist",
  target: "browser",
  minify: true,
  sourcemap: "external",
  plugins: [twPlugin],
  define: DEFINE,
});

if (!webResult.success) {
  console.error("❌ Web asset build failed:");
  for (const log of webResult.logs) console.error("  ", log.message);
  process.exit(1);
}

console.log("✅ Web assets built to ./dist/");
for (const out of webResult.outputs) {
  console.log(`   ${out.path.replace(process.cwd(), ".")}  (${formatMB(out.size)})`);
}

// ─── Stage 2: Binaries ────────────────────────────────────────────────────────

console.log("\n📦 Stage 2 — compiling binaries...\n");

rmSync("./binaries", { recursive: true, force: true });
mkdirSync("./binaries", { recursive: true });

let allPassed = true;

for (const { target, outfile } of TARGETS) {
  process.stdout.write(`   ${target.padEnd(22)}`);

  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: { outfile },
    plugins: [twPlugin],
    minify: true,
    target: target as "bun",
    define: DEFINE,
  });

  if (!result.success) {
    console.log("❌");
    for (const log of result.logs) console.error(`      ${log.message}`);
    allPassed = false;
  } else {
    const size = Bun.file(outfile).size;
    console.log(`✅  ${formatMB(size)}`);
  }
}

if (!allPassed) {
  console.error("\n❌ One or more binary builds failed.");
  process.exit(1);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`
✅ Build complete!

📂 Binaries in ./binaries/`);

for (const { outfile } of TARGETS) {
  console.log(`   ${outfile}`);
}

console.log(`
📋 Distribute to agents:
   1. Copy the binary for their platform to ~/bin/agenthub (or any directory on PATH)
   2. chmod +x ~/bin/agenthub   (macOS / Linux)
   3. Set HUB_DB_PATH=~/.agenthub/hub.db in their environment
   4. Run: agenthub server       (moderator machine, first time)
   5. Run: agenthub agent:register --id <id> --dir <path> --name <name>
`);
