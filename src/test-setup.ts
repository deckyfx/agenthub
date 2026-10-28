/**
 * `bun test` preload: point every hub path at one throwaway dir before any
 * module (notably the DB singleton) reads its config. Tests never touch the
 * real ~/.claude, ~/.agenthub or /tmp/cc-socks.
 */
import { afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// Short root: Unix socket paths are capped at ~104 bytes on macOS.
export const TEST_ROOT = `/tmp/ah-test-${process.pid}`;

mkdirSync(join(TEST_ROOT, "claude", "sessions"), { recursive: true });
mkdirSync(join(TEST_ROOT, "socks"), { recursive: true });
Bun.env.CLAUDE_CONFIG_DIR = join(TEST_ROOT, "claude");
Bun.env.HUB_SOCKET_DIR = join(TEST_ROOT, "socks");
Bun.env.HUB_DB_PATH = join(TEST_ROOT, "hub.db");
Bun.env.NODE_ENV = "test";
// Don't inherit the developer's .env bind / allow-list.
Bun.env.SERVER_HOST = "127.0.0.1";
Bun.env.HUB_ALLOWED_HOSTS = "hub.tailnet.example";

// A global hook in the preload runs once, after every test file.
afterAll(() => rmSync(TEST_ROOT, { recursive: true, force: true }));
