/**
 * Centralized CSS styles for Majoor Project Settings.
 *
 * Injected once into <head> as a single <style> tag.
 * Replaces all scattered inline styles for shared elements.
 *
 * Scoped under the .mjr-ps-* namespace to avoid conflicts.
 * CSS custom properties fall back to ComfyUI's own tokens.
 */
/**
 * Inject the shared CSS into <head> exactly once.
 * Safe to call multiple times.
 */
export declare function injectStyles(): void;
