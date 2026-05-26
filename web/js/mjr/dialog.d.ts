export interface PromptOptions {
    title?: string;
    message?: string;
    defaultValue?: string;
}
export interface ConfirmOptions {
    title?: string;
    message?: string;
}
export declare function psPrompt({ title, message, defaultValue }?: PromptOptions): Promise<string | null>;
export declare function psConfirm({ title, message }?: ConfirmOptions): Promise<boolean>;
