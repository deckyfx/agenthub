/** Print a JSON result to stdout (the CLI's machine-readable contract). */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Print `{ ok: false, error }` and exit 1. */
export function fail(message: string): never {
  console.log(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}
