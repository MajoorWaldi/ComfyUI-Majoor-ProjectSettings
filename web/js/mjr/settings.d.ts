import type { SettingId } from "../types/domain.js";
export declare function toBool(value: unknown, fallback: boolean): boolean;
export declare function toNumber(value: unknown, fallback: number): number;
export declare function getSettingValue<T = unknown>(id: SettingId | string): T | undefined;
export declare function getSettingBool(id: SettingId | string, fallback: boolean): boolean;
export declare function setSettingValue(id: SettingId | string, value: unknown): void;
