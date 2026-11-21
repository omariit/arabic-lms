import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { login, qaState, shot } from "./helpers";

/**
 * لوحة الشرح inside the Teaching Studio, end to end.
 *
 * Real files, real tools, a real recording:
 *   PDF (printed by the browser) + DOCX + PPTX → pages,
 *   pen / highlighter / rectangle / arrow on the canvas,
 *   hide-the-toolbar, sticky stop button,
 *   and the recording reaches READY so the canvas really was captured.
 *
 * The toolbar is DOM outside the <canvas>, which is exactly why the tools are
 * never inside the video — asserted structurally below.
 */
test.describe("studio board", () => {
  test.setTimeout(300_000);

  test("opens PDF/Word/PowerPoint, annotates with every tool and records it", async ({ page }) => {
    const { courseId, lessonId } = qaState();
    await login(page, "teacher");

    // One recording per lesson: clear leftovers so the run is repeatable.
    const existing = await page.request.get("/api/admin/recordings");
    for (const rec of existing.ok() ? ((await existing.json()).recordings ?? []) : []) {
      if (rec.courseId === courseId) await page.request.delete(`/api/admin/recordings/${rec.id}`);
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "board-"));
    const cleanup: string[] = [];

    // A real PDF, printed by Chromium from a simple document.
    const printer = await page.context().newPage();
    await printer.setContent(
      `<html dir="rtl"><body style="font-family:sans-serif"><h1>درس تجريبي — متن الجزرية</h1>
       <p>بسم الله الرحمن الرحيم. هذه صفحة تُطبع لاختبار لوحة الشرح داخل الاستوديو.</p></body></html>`,
    );
    const pdfPath = path.join(tmp, "lesson.pdf");
    fs.writeFileSync(pdfPath, await printer.pdf({ format: "A4", landscape: true }));
    await printer.close();
    cleanup.push(pdfPath);

    // A real .docx and .pptx (OOXML is a zip with XML inside).
    const docx = new JSZip();
    docx.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    );
    docx.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>متن الجزرية</w:t></w:r></w:p>
        <w:p><w:r><w:t>بسم الله الرحمن الرحيم — هذا نص للتجربة يُعرض داخل لوحة الشرح.</w:t></w:r></w:p>
      </w:body></w:document>`,
    );
    const docxPath = path.join(tmp, "lesson.docx");
    fs.writeFileSync(docxPath, await docx.generateAsync({ type: "nodebuffer" }));
    cleanup.push(docxPath);

    const pptx = new JSZip();
    pptx.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
        <p:sp><p:txBody><a:p><a:r><a:t>أحكام النون الساكنة</a:t></a:r></a:p>
        <a:p><a:r><a:t>الإظهار</a:t></a:r></a:p>
        <a:p><a:r><a:t>الإدغام</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld></p:sld>`,
    );
    const pptxPath = path.join(tmp, "lesson.pptx");
    fs.writeFileSync(pptxPath, await pptx.generateAsync({ type: "nodebuffer" }));
    cleanup.push(pptxPath);

    await page.goto("/admin/studio");
    await page.getByLabel("مصدر الصورة").selectOption("board");

    // Empty board → recording is refused.
    const startBtn = page.getByRole("button", { name: /ابدئي التسجيل/ });
    await expect(startBtn).toBeDisabled();
    await expect(page.getByText(/أضيفي ملفًا أو شاركي الشاشة/)).toBeVisible();

    const input = page.getByTestId("board-file-input");

    // The counter badge: {current} / {total}; the PDF page count depends on content.
    const badge = page.getByTestId("board-page-badge");
    const total = async () => Number(((await badge.first().innerText()) || "").split("/")[1]?.trim() ?? 0);

    // ── PDF ──
    await input.setInputFiles(pdfPath);
    await expect(badge.first()).toBeVisible({ timeout: 60_000 });
    const afterPdf = await total();
    expect(afterPdf).toBeGreaterThan(0);

    // ── Word + PowerPoint append pages ──
    await input.setInputFiles([docxPath]);
    await expect.poll(total, { timeout: 30_000 }).toBeGreaterThan(afterPdf);
    const afterDocx = await total();

    await input.setInputFiles([pptxPath]);
    await expect.poll(total, { timeout: 30_000 }).toBeGreaterThan(afterDocx);
    const afterPptx = await total();

    // Navigation works backwards too.
    await page.getByRole("button", { name: "◀" }).click();
    await expect(badge.first()).toHaveText(`2 / ${afterPptx}`);

    // ── tools ──
    const canvas = page.getByTestId("board-canvas");
    const box = (await canvas.boundingBox())!;
    const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

    const draw = async (from: [number, number], to: [number, number]) => {
      const a = at(...from);
      const b = at(...to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
      await page.mouse.move(b.x, b.y, { steps: 6 });
      await page.mouse.up();
    };

    const strokes = async () => Number((await page.getByTestId("board-strokes").innerText()) || 0);

    let previous = 0;
    for (const tool of ["pen", "highlight", "line", "arrow", "rect", "ellipse"]) {
      await page.getByTestId(`board-tool-${tool}`).click();
      await draw([0.25, 0.3], [0.6, 0.55]);
      // Every tool must leave a mark of its own.
      await expect.poll(strokes, { timeout: 10_000 }).toBeGreaterThan(previous);
      previous = await strokes();
    }

    // Colour + thickness are applied without breaking anything.
    await page.getByLabel(/لون #ff5252/).click();
    await page.getByLabel("سمك 16").click();
    await page.getByTestId("board-tool-arrow").click();
    await draw([0.3, 0.65], [0.7, 0.7]);
    await expect.poll(strokes, { timeout: 10_000 }).toBeGreaterThan(previous);
    const withArrow = await strokes();

    // Undo removes the last mark (the eraser tool is a per-tap undo).
    await page.getByTestId("board-tool-erase").click();
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
    await expect.poll(strokes, { timeout: 10_000 }).toBeLessThan(withArrow);

    await shot(page, "board-tools");

    // Zoom in, then hide the toolbar for a clean picture (tools are DOM → never recorded).
    await page.getByRole("button", { name: "＋" }).click();
    await expect(page.getByText("120%")).toBeVisible();
    await page.getByTestId("board-toggle-tools").click();
    await expect(page.getByTestId("board-file-input")).toHaveCount(0);
    await expect(page.getByTestId("board-canvas")).toBeVisible();
    await page.getByTestId("board-toggle-tools").click();
    await expect(page.getByTestId("board-file-input")).toHaveCount(1);

    // ── record ──
    await page.getByLabel("الدورة").selectOption(courseId);
    await page.getByLabel(/الدرس/).selectOption(lessonId);
    const marker = `QA-لوحة-${Date.now().toString().slice(-5)}`;
    await page.getByLabel("عنوان التسجيل").fill(marker);
    await startBtn.click();

    await expect(page.getByTestId("recording-panel")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("stop-recording-sticky")).toBeVisible();
    await page.waitForTimeout(9_000);
    await shot(page, "board-recording");

    // The sticky stop button is the one a teacher on a phone will hit.
    await page.getByTestId("stop-recording-sticky").click();

    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/admin/recordings");
          const rows = res.ok() ? ((await res.json()).recordings ?? []) : [];
          const mine = rows.find((r: { title: string }) => r.title === marker);
          return mine ? `${mine.status}:${mine.hasVideo}` : "missing";
        },
        { timeout: 180_000, intervals: [3000, 5000, 5000, 8000] },
      )
      .toBe("READY:true");

    // Clean up.
    const after = await page.request.get("/api/admin/recordings");
    for (const rec of after.ok() ? ((await after.json()).recordings ?? []) : []) {
      if (rec.title === marker) await page.request.delete(`/api/admin/recordings/${rec.id}`);
    }
    for (const f of cleanup) fs.rmSync(f, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
