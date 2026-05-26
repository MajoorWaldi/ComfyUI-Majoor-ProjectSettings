declare module "../../scripts/app.js" {
  export const app: any;
}

declare module "../../../scripts/app.js" {
  export const app: any;
}

declare module "*/scripts/app.js" {
  export const app: any;
}

interface Window {
  MJR_DEBUG?: boolean;
}
