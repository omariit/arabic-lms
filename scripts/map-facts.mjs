#!/usr/bin/env node
/**
 * Measured inventory of the project — the numbers that go into docs/PROJECT-MAP.md.
 *
 * Why this exists: the map claims exact counts ("32 pages", "75 routes", "30 models"). Those
 * claims are only worth something if they can be re-verified cheaply. Running this prints the
 * facts in one screen, so refreshing the map after a change costs one command instead of a
 * codebase tour.
 *
 *   node scripts/map-facts.mjs          # human/markdown summary
 *   node scripts/map-facts.mjs --check  # exit 1 if the map's numbers are stale
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (dir, filter) => {
  const out = [];
  const visit = (d) => {
    for (const entry of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = path.join(d, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (!/node_modules|\.next|test-results|\.git/.test(rel)) visit(rel);
      } else if (filter(rel)) out.push(rel);
    }
  };
  if (fs.existsSync(path.join(root, dir))) visit(dir);
  return out;
};

const pages = walk("src/app", (f) => f.endsWith("page.tsx")).sort();
const routes = walk("src/app/api", (f) => f.endsWith("route.ts")).sort();
const schema = read("prisma/schema.prisma");
const models = [...schema.matchAll(/^model (\w+)/gm)].map((m) => m[1]);
const enums = [...schema.matchAll(/^enum (\w+)/gm)].map((m) => m[1]);
const migrations = fs.readdirSync(path.join(root, "prisma/migrations")).filter((d) => d !== "migration_lock.toml");
const server = read("server.js");
const events = [...new Set([...server.matchAll(/["'](meet:[a-z-]+)["']/g)].map((m) => m[1]))].sort();
const envKeys = read(".env.example")
  .split("\n")
  .map((l) => /^([A-Z0-9_]+)=/.exec(l)?.[1])
  .filter(Boolean);
const specs = walk("tests/e2e", (f) => f.endsWith(".spec.ts"));
const units = walk("tests", (f) => f.endsWith(".test.ts"));
const lines = (f) => (fs.existsSync(path.join(root, f)) ? read(f).split("\n").length : 0);
const largest = [
  "src/components/meeting-room.tsx",
  "src/components/board-stage.tsx",
  "src/components/protected-player.tsx",
  "server.js",
  "prisma/schema.prisma",
  "recording-service/server.js",
  "src/lib/board-pages.ts",
  "src/lib/recording.ts",
]
  .map((f) => [f, lines(f)])
  .sort((a, b) => b[1] - a[1]);

const facts = {
  pages: pages.length,
  apiRoutes: routes.length,
  models: models.length,
  enums: enums.length,
  migrations: migrations.length,
  socketEvents: events.length,
  envKeys: envKeys.length,
  e2eSpecs: specs.length,
  unitFiles: units.length,
  components: walk("src/components", (f) => f.endsWith(".tsx")).length,
  libModules: walk("src/lib", (f) => f.endsWith(".ts")).length,
};

if (process.argv.includes("--check")) {
  const map = read("docs/PROJECT-MAP.md");
  const expect = {
    صفحات: facts.pages,
    "مسار API": facts.apiRoutes,
    model: facts.models,
    enum: facts.enums,
    migration: facts.migrations,
  };
  const stale = Object.entries(expect).filter(([word, n]) => {
    const arabic = String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
    return !map.includes(arabic) && !map.includes(String(n));
  });
  if (stale.length) {
    console.error("خريطة المشروع لا تطابق الكود:", stale.map(([w, n]) => `${w}=${n}`).join(" · "));
    process.exit(1);
  }
  console.log("✓ أرقام docs/PROJECT-MAP.md مطابقة للكود");
  process.exit(0);
}

console.log(`# حقائق المشروع (مقيسة) — ${new Date().toISOString().slice(0, 10)}\n`);
console.log("| البند | العدد |\n|---|---|");
for (const [k, v] of Object.entries(facts)) console.log(`| ${k} | ${v} |`);
console.log(`\n## الصفحات (${pages.length})`);
console.log(pages.map((f) => "`" + f.replace("src/app", "").replace("/page.tsx", "") + "`").join(" · "));
console.log(`\n## المسارات (${routes.length})`);
console.log(routes.map((f) => "`" + f.replace("src/app", "").replace("/route.ts", "") + "`").join(" · "));
console.log(`\n## النماذج (${models.length})`);
console.log(models.join(" · "));
console.log(`\n## الـenums (${enums.length})`);
console.log(enums.join(" · "));
console.log(`\n## الهجرات (${migrations.length})`);
console.log(migrations.join(" · "));
console.log(`\n## أحداث Socket في /meet (${events.length})`);
console.log(events.join(" · "));
console.log(`\n## متغيرات البيئة (${envKeys.length})`);
console.log(envKeys.join(" · "));
console.log(`\n## أكبر الملفات (سطرًا)`);
for (const [f, n] of largest) console.log(`${String(n).padStart(5)}  ${f}`);
console.log(`\n## الاختبارات: ${specs.length} spec · ${units.length} ملف وحدة`);
console.log(specs.map((f) => "`" + path.basename(f) + "`").join(" · "));
