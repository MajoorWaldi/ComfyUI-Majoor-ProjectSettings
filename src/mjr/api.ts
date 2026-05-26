import type {
  ModelToolResponse,
  ProjectListResponse,
  ProjectResolveResponse,
  ProjectSetResponse,
  TemplatePreviewResponse,
  WorkflowSavePayload,
  WorkflowSaveResponse,
} from "../types/domain.js";

let _csrfTokenPromise: Promise<string> | null = null;

type MutableRequestInit = RequestInit & {
  headers: Record<string, string>;
};

function _getApiKey(): string {
  try {
    const key = localStorage.getItem("mjr_api_key");
    return (key || "").trim();
  } catch (_) {
    return "";
  }
}

async function _getCsrfToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    _csrfTokenPromise = null;
  }
  if (_csrfTokenPromise) return _csrfTokenPromise;
  _csrfTokenPromise = (async () => {
    try {
      const resp = await fetch("/mjr_security/csrf", { 
        credentials: "same-origin",
        headers: {
          "Accept": "application/json"
        }
      });
      const data = await resp.json().catch(() => ({})) as { ok?: boolean; error?: string; csrf_token?: string };
      if (!resp.ok || data?.ok === false) {
        console.error("[MJR] Failed to get CSRF token:", data?.error || `HTTP ${resp.status}`);
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      const token = data?.csrf_token || "";
      if (!token) {
        console.error("[MJR] CSRF token is empty");
      }
      return token;
    } catch (err) {
      console.error("[MJR] Error fetching CSRF token:", err);
      _csrfTokenPromise = null; // Reset on error
      throw err;
    }
  })();
  return _csrfTokenPromise;
}

export async function fetchJSON<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const o = (opts ? { ...opts } : {}) as MutableRequestInit;
  o.credentials = o.credentials || "same-origin";
  const headers: Record<string, string> = {};
  new Headers(o.headers || {}).forEach((value, key) => {
    headers[key] = value;
  });
  o.headers = headers;

  const apiKey = _getApiKey();
  if (apiKey && !o.headers["X-MJR-API-Key"] && !o.headers["Authorization"]) {
    o.headers["X-MJR-API-Key"] = apiKey;
  }

  const method = String(o.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = await _getCsrfToken();
    if (csrf) {
      o.headers["X-CSRF-Token"] = csrf;
    } else {
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
      const retryData = await retryResp.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!retryResp.ok || retryData?.ok === false) {
        throw new Error(retryData?.error || `HTTP ${retryResp.status}`);
      }
      return retryData as T;
    }
  }
  
  const data = await resp.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return data as T;
}

export async function tryResolveProjectId(folder: string): Promise<string> {
  try {
    const data = await fetchJSON<ProjectResolveResponse>(`/mjr_project/resolve?folder=${encodeURIComponent(folder)}`);
    if (data?.ok) return data.project_id || "";
  } catch (_) {}
  return "";
}

export async function listProjects(): Promise<ProjectListResponse> {
  return fetchJSON<ProjectListResponse>("/mjr_project/list");
}

export async function setProject(project_name: string, create_base = true): Promise<ProjectSetResponse> {
  return fetchJSON<ProjectSetResponse>("/mjr_project/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_name, create_base }),
  });
}

export async function getModels(): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_project/models");
}

export async function createCustomOut(payload: Record<string, unknown>): Promise<TemplatePreviewResponse> {
  return fetchJSON<TemplatePreviewResponse>("/mjr_project/create_custom_out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export async function previewTemplate(template: string, tokens: Record<string, unknown>): Promise<TemplatePreviewResponse> {
  return fetchJSON<TemplatePreviewResponse>("/mjr_project/preview_template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template, tokens: tokens || {} }),
  });
}

export async function listExistingNames(project_id: string, media = "images"): Promise<string[]> {
  const qs = new URLSearchParams({
    project_id: project_id || "",
    media: media || "images",
  });
  const data = await fetchJSON<{ names?: unknown[] }>(`/mjr_project/assets/list_names?${qs.toString()}`);
  return Array.isArray(data?.names) ? data.names.map((name) => String(name)) : [];
}

export async function saveWorkflow(payload: WorkflowSavePayload): Promise<WorkflowSaveResponse> {
  return fetchJSON<WorkflowSaveResponse>("/mjr_project/workflow/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export async function scanModelCandidates(missing: unknown[]): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/scan_candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ missing: missing || [] }),
  });
}

export async function resolveModelRecipes(missing: unknown[]): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/resolve_recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ missing: missing || [] }),
  });
}

export async function saveModelRecipes(items: unknown[]): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/save_recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: items || [] }),
  });
}

export async function downloadModels(items: unknown[]): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: items || [] }),
  });
}

export async function getDownloadStatus(job_id: string): Promise<ModelToolResponse> {
  const qs = new URLSearchParams({ job_id: job_id || "" });
  return fetchJSON<ModelToolResponse>(`/mjr_models/download_status?${qs.toString()}`);
}

export async function getFingerprintCacheStatus(): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/fingerprint_cache_status");
}

export async function buildFingerprintCache(payload: Record<string, unknown>): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/build_fingerprint_cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export async function resolveFingerprint(payload: Record<string, unknown>): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/resolve_by_fingerprint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export async function searchRegistry(query: string, limit = 6): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/registry/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: String(query || ""), limit }),
  });
}

export async function contributeRegistry(payload: Record<string, unknown>): Promise<ModelToolResponse> {
  return fetchJSON<ModelToolResponse>("/mjr_models/registry/contribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}
