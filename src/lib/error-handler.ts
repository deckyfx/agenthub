/**
 * Go-style async error handler.
 * Returns [undefined, data] on success, [error] on failure.
 * Re-throws unexpected errors not in errorToCatch.
 */
export function catchErrorTyped<T, E extends new (...args: never[]) => Error>(
  promise: Promise<T>,
  errorToCatch?: E[],
): Promise<[undefined, T] | [InstanceType<E>]> {
  return promise
    .then((data) => [undefined, data] as [undefined, T])
    .catch((error: unknown) => {
      if (errorToCatch === undefined) {
        return [error] as [InstanceType<E>];
      }
      if (errorToCatch.some((E) => error instanceof E)) {
        return [error] as [InstanceType<E>];
      }
      throw error;
    });
}

/**
 * Simple async error handler — catches all errors.
 */
export function catchError<T>(
  promise: Promise<T>,
): Promise<[undefined, T] | [Error]> {
  return promise
    .then((data) => [undefined, data] as [undefined, T])
    .catch((error: unknown) => [
      error instanceof Error ? error : new Error(String(error)),
    ]);
}
