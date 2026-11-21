/**
 * Turns a teacher's file into canvas pages the board can draw.
 *
 * Everything ends up as an HTMLCanvasElement so the recording surface treats a
 * PDF page, a Word page, a PowerPoint slide, a photo and a screenshot exactly the
 * same way: draw it, zoom it, write on it.
 *
 * All parsing happens in the browser — nothing is uploaded. Word/PowerPoint are
 * rendered as clean typeset pages, which is what a teacher actually needs while
 * explaining (layout fidelity of PowerPoint is not worth shipping a renderer for).
 */

export type Page = {
  canvas: HTMLCanvasElement;
  label: string;
};

const PAGE_W = 1600;
const PAGE_H = 1131; // A4 landscape-ish ratio; images keep their own ratio

function newCanvas(w = PAGE_W, h = PAGE_H): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function paperBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
}

/** Word-wrap that understands Arabic (word based, RTL-safe). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function imagePage(file: File | Blob): Promise<Page> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const c = newCanvas(img.naturalWidth || PAGE_W, img.naturalHeight || PAGE_H);
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return { canvas: c, label: "صورة" };
}

/** Lazy-load pdf.js only when a PDF is actually opened. */
async function pdfPages(file: File): Promise<Page[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, disableFontFace: false }).promise;
  const pages: Page[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1600 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = newCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    paperBackground(ctx, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push({ canvas, label: `${i}` });
  }
  return pages;
}

type DocBlock = { text: string; kind: "h1" | "h2" | "p" };

/** .docx → paragraphs (no dependency beyond JSZip: word/document.xml is simple). */
async function docxBlocks(file: File): Promise<DocBlock[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const blocks: DocBlock[] = [];
  for (const p of Array.from(doc.getElementsByTagName("w:p"))) {
    const texts = Array.from(p.getElementsByTagName("w:t")).map((t) => t.textContent ?? "");
    const text = texts.join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const style = p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? "";
    const kind: DocBlock["kind"] = /Heading1|Title/i.test(style) ? "h1" : /Heading/i.test(style) ? "h2" : "p";
    blocks.push({ text, kind });
  }
  return blocks;
}

/** .pptx → one page per slide with its title and bullet text. */
async function pptxSlides(file: File): Promise<Page[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]));

  const pages: Page[] = [];
  for (const name of names) {
    const xml = await zip.file(name)!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const lines = Array.from(doc.getElementsByTagName("a:t"))
      .map((t) => (t.textContent ?? "").trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const canvas = newCanvas(1600, 900);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0f2e25";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    let y = 140;
    const [title, ...rest] = lines;
    ctx.fillStyle = "#ffd54a";
    ctx.font = "bold 62px system-ui, sans-serif";
    for (const line of wrapText(ctx, title, 1380)) {
      ctx.fillText(line, 1520, y);
      y += 78;
    }
    y += 30;
    ctx.fillStyle = "#ffffff";
    ctx.font = "44px system-ui, sans-serif";
    for (const line of rest) {
      for (const wrapped of wrapText(ctx, line, 1360)) {
        if (y > 830) break;
        ctx.fillText(`• ${wrapped}`, 1520, y);
        y += 66;
      }
    }
    pages.push({ canvas, label: String(pages.length + 1) });
  }
  return pages;
}

/** Typeset the extracted Word blocks onto pages. */
function renderDoc(blocks: DocBlock[]): Page[] {
  const pages: Page[] = [];
  let canvas = newCanvas();
  let ctx = canvas.getContext("2d")!;
  let y = 110;

  const startPage = () => {
    canvas = newCanvas();
    ctx = canvas.getContext("2d")!;
    paperBackground(ctx, canvas.width, canvas.height);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    y = 110;
  };
  const push = () => pages.push({ canvas, label: String(pages.length + 1) });

  startPage();
  for (const block of blocks) {
    const font =
      block.kind === "h1"
        ? "bold 56px system-ui, sans-serif"
        : block.kind === "h2"
          ? "bold 44px system-ui, sans-serif"
          : "32px system-ui, sans-serif";
    const lineHeight = block.kind === "p" ? 46 : 66;
    ctx.font = font;
    ctx.fillStyle = block.kind === "p" ? "#1f2937" : "#0f2e25";
    for (const line of wrapText(ctx, block.text, 1420)) {
      if (y + lineHeight > canvas.height - 80) {
        push();
        startPage();
        ctx.font = font;
        ctx.fillStyle = block.kind === "p" ? "#1f2937" : "#0f2e25";
      }
      ctx.fillText(line, 1520, y);
      y += lineHeight;
    }
    y += block.kind === "p" ? 16 : 26;
  }
  push();
  return pages;
}

export type LoadResult = { pages: Page[]; error?: string };

/** Public entry: one file in, canvas pages out. */
export async function loadPages(file: File): Promise<LoadResult> {
  const name = file.name.toLowerCase();
  try {
    if (file.type.startsWith("image/")) return { pages: [await imagePage(file)] };
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return { pages: await pdfPages(file) };
    if (name.endsWith(".docx")) return { pages: renderDoc(await docxBlocks(file)) };
    if (name.endsWith(".pptx")) return { pages: await pptxSlides(file) };
    return {
      pages: [],
      error: "هذا النوع غير مدعوم داخل اللوحة — استخدمي PDF أو صورة أو Word (.docx) أو PowerPoint (.pptx)",
    };
  } catch {
    return { pages: [], error: "تعذّر قراءة الملف — تأكّدي أنه غير تالف وأنه من الأنواع المدعومة" };
  }
}
