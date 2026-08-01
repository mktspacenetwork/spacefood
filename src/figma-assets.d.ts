// Ambient module for the custom "figma:asset/..." import scheme resolved by
// the figmaAssetResolver Vite plugin in vite.config.ts (maps to src/assets/*).
declare module "figma:asset/*" {
  const src: string;
  export default src;
}
