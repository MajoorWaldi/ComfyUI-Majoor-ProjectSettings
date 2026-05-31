declare module "../../scripts/app.js" {
  export const app: any;
}

declare module "../../../scripts/app.js" {
  export const app: any;
}

declare module "*/scripts/app.js" {
  export const app: any;
}

declare module "../../../scripts/ui/components/button.js" {
  export class ComfyButton {
    element: HTMLElement;
    constructor(options: {
      icon?: string;
      action?: () => void;
      tooltip?: string;
      content?: string;
      classList?: string;
    });
  }
}

declare module "*/scripts/ui/components/button.js" {
  export class ComfyButton {
    element: HTMLElement;
    constructor(options: {
      icon?: string;
      action?: () => void;
      tooltip?: string;
      content?: string;
      classList?: string;
    });
  }
}

declare module "../../../scripts/ui/components/buttonGroup.js" {
  export class ComfyButtonGroup {
    element: HTMLElement;
    constructor(...elements: HTMLElement[]);
  }
}

declare module "*/scripts/ui/components/buttonGroup.js" {
  export class ComfyButtonGroup {
    element: HTMLElement;
    constructor(...elements: HTMLElement[]);
  }
}

interface Window {
  MJR_DEBUG?: boolean;
}
