export type StyleMap = Partial<CSSStyleDeclaration>;
export declare function applyStyles<T extends HTMLElement>(element: T, styles: StyleMap): T;
export declare function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: {
    id?: string;
    text?: string;
    className?: string;
    styles?: StyleMap;
}): HTMLElementTagNameMap[K];
