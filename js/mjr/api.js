let _csrfTokenPromise = null;
function _getApiKey() {
    try {
        const key = localStorage.getItem("mjr_api_key");
        return (key || "").trim();
    }
    catch (_) {
        return "";
    }
}
async function _getCsrfToken(forceRefresh = false) {
    if (forceRefresh) {
        _csrfTokenPromise = null;
    }
    if (_csrfTokenPromise)
        return _csrfTokenPromise;
    _csrfTokenPromise = (async () => {
        try {
            const resp = await fetch("/mjr_security/csrf", {
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                }
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || data?.ok === false) {
                console.error("[MJR] Failed to get CSRF token:", data?.error || `HTTP ${resp.status}`);
                throw new Error(data?.error || `HTTP ${resp.status}`);
            }
            const token = data?.csrf_token || "";
            if (!token) {
                console.error("[MJR] CSRF token is empty");
            }
            return token;
        }
        catch (err) {
            console.error("[MJR] Error fetching CSRF token:", err);
            _csrfTokenPromise = null; // Reset on error
            throw err;
        }
    })();
    return _csrfTokenPromise;
}
export async function fetchJSON(url, opts) {
    const o = opts ? { ...opts } : {};
    o.credentials = o.credentials || "same-origin";
    o.headers = { ...(o.headers || {}) };
    const apiKey = _getApiKey();
    if (apiKey && !o.headers["X-MJR-API-Key"] && !o.headers["Authorization"]) {
        o.headers["X-MJR-API-Key"] = apiKey;
    }
    const method = String(o.method || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        const csrf = await _getCsrfToken();
        if (csrf) {
            o.headers["X-CSRF-Token"] = csrf;
        }
        else {
            console.warn("[MJR] No CSRF token available for request");
        }
    }
    const resp = await fetch(url, o);
    // If we get a 403 (Forbidden), it might be a CSRF issue - retry once with fresh token
    if (resp.status === 403 && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        console.warn("[MJR] Got 403, retrying with fresh CSRF token...");
        const freshCsrf = await _getCsrfToken(true);
        if (freshCsrf && freshCsrf !== o.headers["X-CSRF-Token"]) {
            o.headers["X-CSRF-Token"] = freshCsrf;
            const retryResp = await fetch(url, o);
            const retryData = await retryResp.json().catch(() => ({}));
            if (!retryResp.ok || retryData?.ok === false) {
                throw new Error(retryData?.error || `HTTP ${retryResp.status}`);
            }
            return retryData;
        }
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return data;
}
export async function tryResolveProjectId(folder) {
    try {
        const data = await fetchJSON(`/mjr_project/resolve?folder=${encodeURIComponent(folder)}`);
        if (data?.ok)
            return data.project_id || "";
    }
    catch (_) { }
    return "";
}
export async function listProjects() {
    return fetchJSON("/mjr_project/list");
}
export async function setProject(project_name, create_base = true) {
    return fetchJSON("/mjr_project/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name, create_base }),
    });
}
export async function getModels() {
    return fetchJSON("/mjr_project/models");
}
export async function createCustomOut(payload) {
    return fetchJSON("/mjr_project/create_custom_out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
    });
}
export async function previewTemplate(template, tokens) {
    return fetchJSON("/mjr_project/preview_template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, tokens: tokens || {} }),
    });
}
export async function listExistingNames(project_id, media = "images") {
    const qs = new URLSearchParams({
        project_id: project_id || "",
        media: media || "images",
    });
    const data = await fetchJSON(`/mjr_project/assets/list_names?${qs.toString()}`);
    return Array.isArray(data?.names) ? data.names : [];
}
export async function saveWorkflow(payload) {
    return fetchJSON("/mjr_project/workflow/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
    });
}
export async function scanModelCandidates(missing) {
    return fetchJSON("/mjr_models/scan_candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missing: missing || [] }),
    });
}
export async function resolveModelRecipes(missing) {
    return fetchJSON("/mjr_models/resolve_recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missing: missing || [] }),
    });
}
export async function saveModelRecipes(items) {
    return fetchJSON("/mjr_models/save_recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items || [] }),
    });
}
export async function downloadModels(items) {
    return fetchJSON("/mjr_models/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items || [] }),
    });
}
export async function getDownloadStatus(job_id) {
    const qs = new URLSearchParams({ job_id: job_id || "" });
    return fetchJSON(`/mjr_models/download_status?${qs.toString()}`);
}
export async function getFingerprintCacheStatus() {
    return fetchJSON("/mjr_models/fingerprint_cache_status");
}
export async function buildFingerprintCache(payload) {
    return fetchJSON("/mjr_models/build_fingerprint_cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
    });
}
export async function resolveFingerprint(payload) {
    return fetchJSON("/mjr_models/resolve_by_fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
    });
}
export async function searchRegistry(query, limit = 6) {
    return fetchJSON("/mjr_models/registry/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: String(query || ""), limit }),
    });
}
export async function contributeRegistry(payload) {
    return fetchJSON("/mjr_models/registry/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
    });
}
//# sourceMappingURL=api.js.map