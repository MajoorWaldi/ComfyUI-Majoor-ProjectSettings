export declare let PATH_WIDGETS: any[];
export declare function loadConfig(): Promise<any>;
export declare function detectNodeMedia(node: any): "images" | "videos";
export declare function isSaveLikeNode(node: any): any;
export declare function alreadyProjectPathed(value: any): boolean;
export declare function patchSingleNode(node: any, relDir: any, filenamePrefix: any): boolean;
export declare function patchSaveNodes(app: any, relDir: any, filenamePrefix: any, targetMedia: any): Promise<number>;
export declare function stampGraphProjectSignature(app: any, state: any): void;
