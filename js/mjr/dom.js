export function applyStyles(element, styles) {
    Object.assign(element.style, styles);
    return element;
}
export function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.id)
        element.id = options.id;
    if (options.text != null)
        element.textContent = options.text;
    if (options.className)
        element.className = options.className;
    if (options.styles)
        applyStyles(element, options.styles);
    return element;
}
//# sourceMappingURL=dom.js.map