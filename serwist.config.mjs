// @ts-check
// `serwist build` runs after `next build` and reads its prerendered output,
// so every prerendered route (/entry and /~offline included) is precached
// without being listed here.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});
