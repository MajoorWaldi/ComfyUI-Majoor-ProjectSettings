export async function fetchJSON(url, opts) {
  const resp = await fetch(url, opts);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return data;
}

export async function tryResolveProjectId(folder) {
  try {
    const resp = await fetch(`/mjr_project/resolve?folder=${encodeURIComponent(folder)}`);
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data?.ok) return data.project_id || "";
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
