export declare function extractNoteTexts(workflowJson: unknown): string[];
export declare function parseRecipesFromNoteText(text: string): Map<string, Record<string, string>>;
export declare function collectRecipesFromWorkflowNotes(workflowJson: unknown): Map<string, Record<string, string>>;
