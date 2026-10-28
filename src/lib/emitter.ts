/** Listener signature for an event map entry. */
type Listener<T> = (payload: T) => void;

/**
 * Minimal type-safe event emitter. `Events` maps event name → payload type.
 *
 * @example
 * const bus = new TypedEmitter<{ ping: number }>();
 * const off = bus.on("ping", (n) => console.log(n));
 * bus.emit("ping", 1);
 * off();
 */
export class TypedEmitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  /** Emit an event to all current listeners. A throwing listener never blocks the rest. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        console.error(`[emitter] listener for '${String(event)}' threw:`, error);
      }
    }
  }
}
