import { app } from "../../../scripts/app.js";
import type { SettingId } from "../types/domain.js";

export function toBool(value: unknown, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off"].includes(v)) return false;
  }
  return fallback;
}

export function toNumber(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function getSettingValue<T = unknown>(id: SettingId | string): T | undefined {
  return (
    app?.extensionManager?.setting?.get?.(id) ??
    app?.ui?.settings?.getSettingValue?.(id) ??
    app?.ui?.settings?.settingsValues?.[id]
  ) as T | undefined;
}

export function getSettingBool(id: SettingId | string, fallback: boolean): boolean {
  return toBool(getSettingValue(id), fallback);
}
