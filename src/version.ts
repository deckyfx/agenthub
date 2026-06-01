import pkg from "../package.json";

/**
 * Build metadata, embedded from package.json.
 *
 * Bun inlines JSON imports at compile time, so the version is baked into the
 * standalone binary during `bun build --compile` — no separate embed step
 * needed. In dev (`bun run`), it's read from package.json at runtime.
 */
export const VERSION: string = pkg.version;

/** The application name, from package.json. */
export const NAME: string = pkg.name;
