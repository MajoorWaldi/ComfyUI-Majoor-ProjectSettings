// Simple logging wrapper for Majoor Project Settings UI
export const MJR_DEBUG = (typeof window !== "undefined" && Boolean(window?.MJR_DEBUG)) || false;

export function debug(...args: unknown[]): void {
  if (MJR_DEBUG) {
    console.debug(...args);
  }
}

export function info(...args: unknown[]): void {
  console.info(...args);
}

export function warn(...args: unknown[]): void {
  console.warn(...args);
}

export function error(...args: unknown[]): void {
  console.error(...args);
}
