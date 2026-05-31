export type DetailsWithSummary = HTMLDetailsElement & { _summary?: HTMLElement };

export interface PanelHelpers {
  section: (label: string) => HTMLDivElement;
  divider: (thick?: boolean) => HTMLDivElement;
  detailsSection: (title: string) => DetailsWithSummary;
  makeLabel: (labelText: string) => HTMLLabelElement;
  styleField: (inputEl: HTMLElement) => void;
  row: (labelText: string, inputEl: HTMLElement) => HTMLDivElement;
  groupRow: (labelText: string, contentEl: HTMLElement) => HTMLDivElement;
  btn: (text: string) => HTMLButtonElement;
}

export function createPanelHelpers(gap: string): PanelHelpers {
  const section = (label: string): HTMLDivElement => {
    const h = document.createElement("div");
    h.textContent = label;
    h.style.fontWeight = "600";
    h.style.marginTop = gap;
    h.style.marginBottom = gap;
    h.style.paddingLeft = "2px";
    h.style.textTransform = "uppercase";
    h.style.letterSpacing = "0.6px";
    h.style.color = "#8fb9ff";
    return h;
  };

  const divider = (thick = false): HTMLDivElement => {
    const d = document.createElement("div");
    d.style.height = thick ? "3px" : "1px";
    d.style.background = "rgba(255,255,255,0.08)";
    d.style.margin = "0";
    return d;
  };

  const detailsSection = (title: string): DetailsWithSummary => {
    const details = document.createElement("details") as DetailsWithSummary;
    details.style.marginTop = "0";
    details.style.display = "flex";
    details.style.flexDirection = "column";
    details.style.gap = gap;
    const summary = document.createElement("summary");
    summary.textContent = title;
    summary.style.cursor = "pointer";
    summary.style.opacity = "0.9";
    summary.style.textTransform = "uppercase";
    summary.style.letterSpacing = "0.6px";
    summary.style.color = "#8fb9ff";
    summary.style.fontWeight = "600";
    summary.style.paddingLeft = "2px";
    details.appendChild(summary);
    details._summary = summary;
    return details;
  };

  const makeLabel = (labelText: string): HTMLLabelElement => {
    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.opacity = "0.85";
    label.style.marginLeft = "2px";
    label.style.fontSize = "11px";
    label.style.lineHeight = "1.2";
    return label;
  };

  const styleField = (inputEl: HTMLElement): void => {
    inputEl.style.width = "100%";
    inputEl.style.boxSizing = "border-box";
    inputEl.style.padding = "6px 8px";
    inputEl.style.borderRadius = "8px";
    inputEl.style.border = "1px solid rgba(255,255,255,0.12)";
    inputEl.style.background = "rgba(0,0,0,0.25)";
    inputEl.style.color = "#eee";
    inputEl.style.outline = "none";
  };

  const row = (labelText: string, inputEl: HTMLElement): HTMLDivElement => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = gap;
    wrap.appendChild(makeLabel(labelText));
    styleField(inputEl);
    wrap.appendChild(inputEl);
    return wrap;
  };

  const groupRow = (labelText: string, contentEl: HTMLElement): HTMLDivElement => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = gap;
    wrap.appendChild(makeLabel(labelText));
    wrap.appendChild(contentEl);
    return wrap;
  };

  const btn = (text: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = text;
    b.className = "mjr-ps-btn";
    b.style.padding = "7px 8px";
    b.style.borderRadius = "8px";
    b.style.border = "1px solid rgba(46, 136, 255, 0.65)";
    b.style.background = "rgba(46, 136, 255, 0.25)";
    b.style.color = "#eee";
    b.style.cursor = "pointer";
    b.style.margin = "0";
    b.style.lineHeight = "1.2";
    b.style.whiteSpace = "nowrap";
    return b;
  };

  return {
    section,
    divider,
    detailsSection,
    makeLabel,
    styleField,
    row,
    groupRow,
    btn,
  };
}
