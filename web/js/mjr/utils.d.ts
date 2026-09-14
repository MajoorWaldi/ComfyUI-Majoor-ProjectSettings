import type { RuntimeState } from "../types/domain.js";
export type TemplateTokens = Record<string, string | number | boolean | null | undefined>;
export declare function titlePathJS(text: unknown): string;
export declare function token3Tag(raw: unknown, upper?: boolean): string;
export declare function yymmddJS(d?: Date): string;
export declare function isoDateJS(d?: Date): string;
export declare function yyyymmddJS(d?: Date): string;
export interface ExtractedDate {
    raw: string;
    yymmdd: string;
    format: "yymmdd" | "yyyymmdd" | "iso";
}
export declare function extractDateFromPath(text: unknown): ExtractedDate | null;
export declare function replaceDateInPath(text: string, newYYMMDD: string): string;
export interface ResolvedModel {
    modelRaw: string;
    tag: string;
    isCustom: boolean;
    modelUpper: boolean;
}
export declare function resolveModel(state: Partial<RuntimeState> | null | undefined): ResolvedModel;
export declare function safeRel(rel: unknown): string;
export declare function joinRel(a: unknown, b: unknown): string;
export declare function mediaDir(media: unknown): string;
export declare function makeKindToken(kind: unknown): string;
export declare function resolveTemplatePreview(template: string, tokens: TemplateTokens): string;
