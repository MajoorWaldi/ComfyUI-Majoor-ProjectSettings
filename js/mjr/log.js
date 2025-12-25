// Simple logging wrapper for Majoor Project Settings UI
export const MJR_DEBUG = (typeof window !== 'undefined' && Boolean(window?.MJR_DEBUG)) || false;

export function debug(...args) {
  if (MJR_DEBUG) {
    console.debug(...args);
  }
}

export function info(...args) {
  console.info(...args);
}

export function warn(...args) {
  console.warn(...args);
}

export function error(...args) {
  console.error(...args);
}
