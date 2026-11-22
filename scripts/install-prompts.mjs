#!/usr/bin/env node
/**
 * Installs docs/prompts/*.md as slash commands for the agent CLI.
 *
 * Prompt templates are plain Markdown files discovered from a config directory
 * (`<config>/prompts/*.md`). Upstream Pi uses `.pi`, this fork uses `.deepai-code`;
 * we write to whichever config directory the project already has, and to `.pi`
 * as a fallback so both are covered.
 *
 *   node scripts/install-prompts.mjs     # copy + report
 *   /reload                              # then the commands appear
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "docs/prompts");
// Both config directories are covered: this fork loads `.deepai-code`, upstream Pi loads `.pi`.
const dirs = [".deepai-code", ".pi"].map((d) => path.join(root, d, "prompts"));

const files = fs.readdirSync(src).filter((f) => f.endsWith(".md"));
const targets = dirs;

for (const dir of targets) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dir, f));
}
for (const f of files) console.log(`/${path.basename(f, ".md")}`);
console.log(`\nتم التثبيت في: ${targets.map((d) => path.relative(root, d)).join(" · ")}`);
console.log("اكتب /reload ثم استخدم الأوامر أعلاه. (المصدر المحرَّر: docs/prompts/)");
