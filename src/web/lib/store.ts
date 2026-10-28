import { useStore } from "zustand";
import { createHubStore, type HubState } from "../../lib/hub-store";
import { api } from "./api";

/** The dashboard's single hub store, fed by the `/api/ws` push channel. */
export const hubStore = createHubStore(api);

/** Select from the hub store (re-renders only when the selected slice changes). */
export function useHub<T>(selector: (s: HubState) => T): T {
  return useStore(hubStore, selector);
}
