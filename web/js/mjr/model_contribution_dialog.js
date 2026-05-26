import { ensureStyles, toast } from "./toast.js";
import { contributeRegistry } from "./api.js";
const PLATFORM_OPTIONS = [
    { value: "huggingface", label: "HuggingFace" },
    { value: "civitai", label: "CivitAI" },
    { value: "github", label: "GitHub" },
    { value: "modelscope", label: "ModelScope" },
    { value: "other", label: "Other" },
];
const TYPE_OPTIONS = [
    { value: "checkpoints", label: "Checkpoint" },
    { value: "loras", label: "LoRA" },
    { value: "vae", label: "VAE" },
    { value: "controlnet", label: "ControlNet" },
    { value: "embeddings", label: "Embedding" },
];
class ModelContributionDialog {
    dialog;
    statusEl;
    submitBtn;
    validateBtn;
    inputs;
    constructor() {
        this.dialog = null;
        this.statusEl = null;
        this.submitBtn = null;
        this.validateBtn = null;
        this.inputs = {};
    }
    show(modelName = "") {
        this.close();
        ensureStyles();
        this._render(modelName);
    }
    close() {
        if (this.dialog) {
            this.dialog.remove();
            this.dialog = null;
            this.statusEl = null;
            this.submitBtn = null;
            this.validateBtn = null;
            this.inputs = {};
        }
    }
    _render(modelName) {
        this.dialog = document.createElement("div");
        this.dialog.className = "mjr-contribution-dialog";
        Object.assign(this.dialog.style, {
            position: "fixed",
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
            zIndex: "9999",
            pointerEvents: "none",
        });
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "absolute",
            inset: "0",
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
        });
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(15, 18, 26, 0.95)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "16px",
            padding: "24px",
            width: "360px",
            color: "#f2f4f8",
            fontFamily: "inherit",
            pointerEvents: "auto",
            boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
        });
        panel.innerHTML = `
      <h2 style="margin:0;font-size:18px;letter-spacing:0.5px;text-transform:uppercase;">Share a model URL</h2>
      <p style="margin:0;font-size:12px;color:#a0b3d6;">Help others by contributing a verified download link.</p>
    `;
        const fields = [
            { id: "name", label: "Model name", placeholder: "Stable Diffusion 1.5" },
            { id: "url", label: "Download URL", placeholder: "https://huggingface.co/.../model.safetensors" },
        ];
        for (const field of fields) {
            const wrap = document.createElement("div");
            wrap.style.display = "flex";
            wrap.style.flexDirection = "column";
            wrap.style.gap = "4px";
            const label = document.createElement("label");
            label.textContent = field.label;
            label.style.fontSize = "11px";
            label.style.opacity = "0.8";
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = field.placeholder;
            input.style.padding = "8px 10px";
            input.style.borderRadius = "8px";
            input.style.border = "1px solid rgba(255,255,255,0.15)";
            input.style.background = "rgba(255,255,255,0.04)";
            input.style.color = "#f4f6fb";
            input.style.fontSize = "13px";
            if (field.id === "name" && modelName) {
                input.value = modelName;
            }
            wrap.appendChild(label);
            wrap.appendChild(input);
            panel.appendChild(wrap);
            this.inputs[field.id] = input;
        }
        const selects = [
            { id: "platform", label: "Platform", options: PLATFORM_OPTIONS },
            { id: "type", label: "Model type", options: TYPE_OPTIONS },
        ];
        for (const selectCfg of selects) {
            const wrap = document.createElement("div");
            wrap.style.display = "flex";
            wrap.style.flexDirection = "column";
            wrap.style.gap = "4px";
            const label = document.createElement("label");
            label.textContent = selectCfg.label;
            label.style.fontSize = "11px";
            label.style.opacity = "0.8";
            const select = document.createElement("select");
            select.style.padding = "8px 10px";
            select.style.borderRadius = "8px";
            select.style.border = "1px solid rgba(255,255,255,0.15)";
            select.style.background = "rgba(255,255,255,0.04)";
            select.style.color = "#f4f6fb";
            select.style.fontSize = "13px";
            for (const option of selectCfg.options) {
                const opt = document.createElement("option");
                opt.value = option.value;
                opt.textContent = option.label;
                select.appendChild(opt);
            }
            wrap.appendChild(label);
            wrap.appendChild(select);
            panel.appendChild(wrap);
            this.inputs[selectCfg.id] = select;
        }
        const extraWrap = document.createElement("div");
        extraWrap.style.display = "flex";
        extraWrap.style.flexDirection = "column";
        extraWrap.style.gap = "4px";
        const fileLabel = document.createElement("label");
        fileLabel.textContent = "Filename (optional)";
        fileLabel.style.fontSize = "11px";
        fileLabel.style.opacity = "0.8";
        const fileInput = document.createElement("input");
        fileInput.type = "text";
        fileInput.placeholder = "model.safetensors";
        Object.assign(fileInput.style, {
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.04)",
            color: "#f4f6fb",
            fontSize: "13px",
        });
        const shaLabel = document.createElement("label");
        shaLabel.textContent = "SHA256 (optional)";
        shaLabel.style.fontSize = "11px";
        shaLabel.style.opacity = "0.8";
        const shaInput = document.createElement("input");
        shaInput.type = "text";
        shaInput.placeholder = "abc123...";
        Object.assign(shaInput.style, {
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.04)",
            color: "#f4f6fb",
            fontSize: "13px",
        });
        extraWrap.appendChild(fileLabel);
        extraWrap.appendChild(fileInput);
        extraWrap.appendChild(shaLabel);
        extraWrap.appendChild(shaInput);
        panel.appendChild(extraWrap);
        this.inputs.filename = fileInput;
        this.inputs.sha256 = shaInput;
        this.statusEl = document.createElement("div");
        this.statusEl.style.minHeight = "20px";
        this.statusEl.style.fontSize = "12px";
        this.statusEl.style.opacity = "0.85";
        panel.appendChild(this.statusEl);
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.justifyContent = "space-between";
        this.validateBtn = document.createElement("button");
        this.validateBtn.textContent = "Validate URL";
        this.validateBtn.className = "mjr-ps-btn";
        this.validateBtn.style.flex = "1";
        this.validateBtn.type = "button";
        this.submitBtn = document.createElement("button");
        this.submitBtn.textContent = "Contribute";
        this.submitBtn.className = "mjr-ps-btn";
        this.submitBtn.style.flex = "1";
        this.submitBtn.type = "button";
        actions.appendChild(this.validateBtn);
        actions.appendChild(this.submitBtn);
        panel.appendChild(actions);
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Cancel";
        closeBtn.type = "button";
        closeBtn.style.alignSelf = "flex-end";
        closeBtn.style.fontSize = "12px";
        closeBtn.style.background = "transparent";
        closeBtn.style.border = "none";
        closeBtn.style.color = "#9ab1d8";
        panel.appendChild(closeBtn);
        this.dialog.appendChild(overlay);
        this.dialog.appendChild(panel);
        document.body.appendChild(this.dialog);
        this.validateBtn.addEventListener("click", () => this._validateUrl());
        this.submitBtn.addEventListener("click", () => this._submit());
        closeBtn.addEventListener("click", () => this.close());
        overlay.addEventListener("click", () => this.close());
    }
    _setStatus(message, tone = "info") {
        if (!this.statusEl)
            return;
        this.statusEl.textContent = message;
        const colors = {
            info: "#a0b3d6",
            success: "#84ff9c",
            error: "#f87c7c",
        };
        this.statusEl.style.color = colors[tone] || colors.info;
    }
    _validateUrl() {
        const value = (this.inputs.url?.value || "").trim();
        if (!value) {
            this._setStatus("Enter the download URL first.", "error");
            return;
        }
        if (!/^https?:\/\//i.test(value)) {
            this._setStatus("URL must start with http:// or https://", "error");
            return;
        }
        this._setStatus("URL format looks good. You can submit!", "success");
    }
    async _submit() {
        if (!this.submitBtn || !this.dialog)
            return;
        const name = (this.inputs.name?.value || "").trim();
        const url = (this.inputs.url?.value || "").trim();
        if (!name || !url) {
            this._setStatus("Model name and URL are required.", "error");
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            this._setStatus("URL must start with http(s)", "error");
            return;
        }
        this.submitBtn.disabled = true;
        this.validateBtn.disabled = true;
        this._setStatus("Sending contribution...", "info");
        try {
            const payload = {
                name,
                url,
                platform: this.inputs.platform?.value || "unknown",
                type: this.inputs.type?.value || "checkpoints",
                filename: (this.inputs.filename?.value || "").trim(),
                sha256: (this.inputs.sha256?.value || "").trim(),
            };
            const resp = await contributeRegistry(payload);
            const added = resp?.added || false;
            this._setStatus(added ? "Contribution recorded, thanks!" : "Source already exists.", "success");
            toast("success", "Contribution", added ? "Thank you for sharing!" : "Source already in registry.");
            if (added) {
                setTimeout(() => this.close(), 1600);
            }
        }
        catch (error) {
            console.error("Contribution failed", error);
            this._setStatus("Failed to send contribution.", "error");
            toast("error", "Contribution failed", String(error?.message || error));
        }
        finally {
            this.submitBtn.disabled = false;
            this.validateBtn.disabled = false;
        }
    }
}
let _dialogInstance = null;
export function showModelContributionDialog(modelName = "") {
    if (!_dialogInstance) {
        _dialogInstance = new ModelContributionDialog();
    }
    _dialogInstance.show(modelName);
}
//# sourceMappingURL=model_contribution_dialog.js.map