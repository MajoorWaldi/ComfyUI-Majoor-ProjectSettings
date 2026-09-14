import { app } from "../../../scripts/app.js";
export function toBool(value, fallback) {
    if (value == null)
        return fallback;
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(v))
            return true;
        if (["false", "0", "no", "off"].includes(v))
            return false;
    }
    return fallback;
}
export function toNumber(value, fallback) {
    if (value == null)
        return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}
export function getSettingValue(id) {
    return (app?.extensionManager?.setting?.get?.(id) ??
        app?.ui?.settings?.getSettingValue?.(id) ??
        app?.ui?.settings?.settingsValues?.[id]);
}
export function getSettingBool(id, fallback) {
    return toBool(getSettingValue(id), fallback);
}
export function setSettingValue(id, value) {
    try {
        if (typeof app?.extensionManager?.setting?.set === "function") {
            app.extensionManager.setting.set(id, value);
        }
        if (typeof app?.ui?.settings?.setSettingValue === "function") {
            app.ui.settings.setSettingValue(id, value);
        }
        if (app?.ui?.settings?.settingsValues) {
            app.ui.settings.settingsValues[id] = value;
        }
    }
    catch (_) { }
}
//# sourceMappingURL=settings.js.map