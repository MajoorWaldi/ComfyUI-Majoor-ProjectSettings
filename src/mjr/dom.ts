export type StyleMap = Partial<CSSStyleDeclaration>;

export function applyStyles<T extends HTMLElement>(element: T, styles: StyleMap): T {
  Object.assign(element.style, styles);
  return element;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    id?: string;
    text?: string;
    className?: string;
    styles?: StyleMap;
  } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (options.id) element.id = options.id;
  if (options.text != null) element.textContent = options.text;
  if (options.className) element.className = options.className;
  if (options.styles) applyStyles(element, options.styles);
  return element;
}
