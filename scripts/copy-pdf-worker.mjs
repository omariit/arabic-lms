import fs from "node:fs";
import path from "node:path";

/**
 * pdf.js needs its worker as a real file next to the app. Copy it into `public/`
 * before every build so the version always matches the installed package.
 */
const from = path.join("node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const to = path.join("public", "pdf.worker.min.mjs");
if (fs.existsSync(from)) {
  fs.copyFileSync(from, to);
  console.log(`pdf worker → ${to}`);
} else {
  console.warn("pdf.worker.min.mjs not found (pdfjs-dist missing?)");
}
