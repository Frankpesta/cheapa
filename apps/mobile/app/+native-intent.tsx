/**
 * iOS opens the app with `cheapa://dataUrl=cheapaShareKey…` after a share. That is not a
 * route: send it to Home and let ShareHandler (root layout) read the shared content.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return path.includes('dataUrl=') ? '/' : path;
}
