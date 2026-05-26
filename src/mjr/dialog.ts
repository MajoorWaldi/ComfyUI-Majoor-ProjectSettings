import { app } from "../../../scripts/app.js";

export async function psPrompt({ title, message, defaultValue } = {}) {
  const dialog = app?.extensionManager?.dialog;
  if (dialog?.prompt) {
    try {
      const result = await dialog.prompt({
        title: title || "Input",
        message: message || "",
        defaultValue: defaultValue ?? "",
        default: defaultValue ?? "",
      });
      if (result === null || result === undefined) return null;
      if (typeof result === "object" && "value" in result) {
        const value = result.value;
        return value == null ? null : String(value);
      }
      return String(result);
    } catch (_) {}
  }
  const fallback = window.prompt(message || title || "", defaultValue ?? "");
  if (fallback === null) return null;
  return String(fallback);
}

export async function psConfirm({ title, message } = {}) {
  const dialog = app?.extensionManager?.dialog;
  if (dialog?.confirm) {
    try {
      const result = await dialog.confirm({
        title: title || "Confirm",
        message: message || "",
      });
      if (typeof result === "boolean") return result;
      if (typeof result === "object" && "value" in result) {
        return Boolean(result.value);
      }
      return Boolean(result);
    } catch (_) {}
  }
  return window.confirm(message || title || "Confirm?");
}
