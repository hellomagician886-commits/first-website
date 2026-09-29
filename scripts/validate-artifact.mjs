import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workerPath = resolve(root, "dist/server/index.js");
const manifestPath = resolve(root, "dist/.openai/hosting.json");
const worker = readFileSync(workerPath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const required = [
  "export default",
  "async fetch(request, env, ctx)",
  'url.pathname === "/api/remove-bg"',
  'url.pathname === "/api/generate-image"',
  "env.REPLICATE_API_TOKEN",
  "env.OPENROUTER_API_KEY",
  "lucataco/remove-bg",
  "openai/gpt-5.4-image-2",
  "一键去除",
  "文字生成图像",
];
for (const value of required) {
  if (!worker.includes(value)) throw new Error(`Missing required artifact content: ${value}`);
}
if (worker.includes("r8_") || worker.includes("sk-or-v1-")) throw new Error("An API token appears to be embedded in the artifact");
if (!manifest.project_id) throw new Error("Missing project_id in hosting manifest");
if (statSync(workerPath).size < 100_000) throw new Error("Worker artifact is unexpectedly small");
console.log("Artifact validation passed");
