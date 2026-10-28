import { render } from "ink";
import { client, ensureServer } from "../lib/client";
import { createHubStore } from "../lib/hub-store";
import { TuiApp } from "./App";

/**
 * `agenthub tui` — start the server if needed, then take over the terminal.
 * A server it started stops with it; an already-running one is left alone.
 */
export async function runTui(): Promise<void> {
  const { started, stop } = await ensureServer({ owned: true });
  const store = createHubStore(client);
  const disconnect = store.getState().connect();
  const app = render(<TuiApp store={store} startedServer={started} />, { alternateScreen: true, exitOnCtrlC: true });
  await app.waitUntilExit();
  disconnect();
  stop();
  process.exit(0);
}
