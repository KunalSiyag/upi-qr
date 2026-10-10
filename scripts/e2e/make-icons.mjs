// Regenerates public/icons/*.png from public/favicon.svg: node scripts/e2e/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { startBrowser } from "./cdp-lib.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const svg = readFileSync(`${ROOT}public/favicon.svg`, "utf8");
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const out = `${ROOT}public/icons`;
const b = await startBrowser(9341);
await b.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

// mode "any": the rounded SVG on transparency. "full": brand background, icon inset (maskable safe zone / iOS).
async function render(size, mode, file) {
  const inset = mode === "full" ? Math.round(size * 0.14) : 0;
  const bg = mode === "full" ? "#113B2C" : "transparent";
  const html = `<html><body style="margin:0;background:${bg};width:${size}px;height:${size}px;overflow:hidden">
    <img src="${src}" style="position:absolute;left:${inset}px;top:${inset}px;width:${size - 2 * inset}px;height:${size - 2 * inset}px" /></body></html>`;
  await b.send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.navigate", { url: `data:text/html;base64,${Buffer.from(html).toString("base64")}` });
  await b.waitFor("document.images[0]?.complete", 5000);
  const { result } = await b.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  writeFileSync(`${out}/${file}`, Buffer.from(result.data, "base64"));
}
await render(192, "any", "icon-192.png");
await render(512, "any", "icon-512.png");
await render(512, "full", "icon-maskable-512.png");
await render(180, "full", "apple-touch-icon.png");
b.close();
console.log("icons written");
