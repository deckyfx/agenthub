/**
 * Build-time stand-in for `react-devtools-core`, which Ink imports for its
 * optional DEV-mode integration. Aliased in `src/build.ts` so the compiled
 * binary doesn't need the package.
 */
export default {
  initialize(): void {},
  connectToDevTools(): void {},
};
