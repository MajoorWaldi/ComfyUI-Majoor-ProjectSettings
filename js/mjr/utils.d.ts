export type TemplateTokens = Record<string, string | number | boolean | null | undefined>;
export declare function titlePathJS(text: unknown): string;
export declare function token3Tag(raw: unknown, upper?: boolean): string;
export declare function yymmddJS(): string;
export declare function safeRel(rel: unknown): string;
export declare function joinRel(a: unknown, b: unknown): string;
export declare function mediaDir(media: unknown): string;
export declare function makeKindToken(kind: unknown): string;
export declare function resolveTemplatePreview(template: string, tokens: TemplateTokens): string;
