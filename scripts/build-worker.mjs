import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const htmlPath = resolve(root, "index.html");
const avatarPath = resolve(root, "IMG_7667.JPG");
const handlerPath = resolve(root, "worker/handler.js");
const outputPath = resolve(root, "dist/server/index.js");

const html = readFileSync(htmlPath, "utf8");
const avatar = readFileSync(avatarPath).toString("base64");
const embeddedHtml = html.replace(
  'src="IMG_7667.JPG"',
  `src="data:image/jpeg;base64,${avatar}"`,
);
if (embeddedHtml === html) throw new Error("Avatar reference was not found in index.html");

const handler = readFileSync(handlerPath, "utf8");
mkdirSync(resolve(root, "dist/server"), { recursive: true });
mkdirSync(resolve(root, "dist/.openai"), { recursive: true });
writeFileSync(outputPath, `const page = ${JSON.stringify(embeddedHtml)};\n${handler}`);
copyFileSync(resolve(root, ".openai/hosting.json"), resolve(root, "dist/.openai/hosting.json"));
console.log("Built dist/server/index.js");
