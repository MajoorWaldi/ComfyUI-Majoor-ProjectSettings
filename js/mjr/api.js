let _csrfTokenPromise = null;

function _getApiKey() {
  try {
    const key = localStorage.getItem("mjr_api_key");
    return (key || "").trim();
  } catch (_) {
    return "";
  }
}

async function _getCsrfToken() {
  if (_csrfTokenPromise) return _csrfTokenPromise;
  _csrfTokenPromise = (async () => {
    const resp = await fetch("/mjr_security/csrf", { credentials: "same-origin" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return data?.csrf_token || "";
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
    if (csrf) o.headers["X-CSRF-Token"] = csrf;
  }

  const resp = await fetch(url, o);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return data;
}

export async function tryResolveProjectId(folder) {
  try {
    const data = await fetchJSON(`/mjr_project/resolve?folder=${encodeURIComponent(folder)}`);
    if (data?.ok) return data.project_id || "";
  } catch (_) {}
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
