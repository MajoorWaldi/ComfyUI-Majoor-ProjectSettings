/**
 * Main UI Components orchestrator for ComfyUI-Majoor-ProjectSettings.
 * Modular, strictly typed, and aligned with modern ComfyUI v0.34+ frontend architecture.
 */
import type { RuntimeState, SidebarRenderOptions } from "./types/domain.js";
export declare function buildPanel(el: HTMLElement, state: RuntimeState, actions: SidebarRenderOptions): void;
