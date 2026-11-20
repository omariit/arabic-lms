import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { looksLikeStandaloneMp4, progressSeconds } from "./lib.js";

/** Run ffmpeg/ffprobe and resolve when they exit. */
export function run(bin, args, { onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
      if (onStderr) onStderr(d.toString());
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
      if (onStderr) onStderr(d.toString());
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${bin} exited ${code}: ${err.slice(-600)}`));
    });
  });
}

export async function probeDuration(file) {
  try {
    const { out } = await run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const seconds = Math.round(Number(out.trim()));
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Normalise one batch of raw MediaRecorder chunks into a single webm/mp4 file.
 *
 * MediaRecorder with a timeslice emits ONE continuous stream split at arbitrary
 * byte offsets, so later chunks are not playable on their own. Concatenating the
 * bytes in index order reconstructs a valid stream — measured by ffprobe.
 */
export async function joinStreamChunks(chunkFiles, targetFile) {
  const handle = await fs.open(targetFile, "w");
  try {
    for (const file of chunkFiles) {
      const buf = await fs.readFile(file);
      await handle.write(buf);
    }
  } finally {
    await handle.close();
  }
  return targetFile;
}

/**
 * Progressive pipeline:
 *  1. probe the joined stream (duration = progress denominator)
 *  2. transcode to a web-friendly H.264/AAC MP4 with faststart, reporting progress
 *  3. extract a thumbnail from ~10% of the video
 *
 * Segmented recordings (self-contained MP4 chunks) take the fast path: normalise
 * each segment, then concat-demux without re-encoding the whole lesson twice.
 */
export async function processSession({ sessionDir, outputDir, onStage, onProgress, log }) {
  const chunksDir = path.join(sessionDir, "chunks");
  const tempDir = path.join(sessionDir, "temp");
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const names = (await fs.readdir(chunksDir)).filter((n) => /^chunk-\d{6}\.bin$/.test(n)).sort();
  if (!names.length) throw new Error("no chunks uploaded for this session");
  const files = names.map((n) => path.join(chunksDir, n));

  onStage?.("probe", 0);
  const head = await fs.readFile(files[0]).then((b) => b.subarray(0, 16)).catch(() => null);
  const segmented = looksLikeStandaloneMp4(head);

  const joined = path.join(tempDir, "joined.mp4");
  const final = path.join(outputDir, "final.mp4");
  const thumb = path.join(outputDir, "thumbnail.jpg");

  let duration = 0;

  if (!segmented) {
    onStage?.("normalize", 2);
    const joinedRaw = path.join(tempDir, `joined.${head && head.readUInt32BE(0) === 0x1a45dfa3 ? "webm" : "bin"}`);
    await joinStreamChunks(files, joinedRaw);
    duration = (await probeDuration(joinedRaw)) ?? 0;

    onStage?.("transcode", 5);
    const args = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", joinedRaw,
      "-map", "0:v:0?", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
      "-pix_fmt", "yuv420p", "-vf", "scale='min(1280,iw)':-2",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000",
      "-movflags", "+faststart",
      "-progress", "pipe:1", "-nostats",
      final,
    ];
    await run("ffmpeg", args, {
      onStderr: (text) => {
        const seconds = progressSeconds(text);
        if (seconds !== null && duration > 0) {
          // transcode occupies the 5–95% band of the progress bar
          onProgress?.(5 + Math.min(90, (seconds / duration) * 90));
        }
      },
    });
    await fs.rm(joinedRaw, { force: true });
  } else {
    onStage?.("normalize", 2);
    const listLines = [];
    for (let i = 0; i < files.length; i++) {
      const seg = path.join(tempDir, `seg-${String(i).padStart(5, "0")}.mp4`);
      await run("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", files[i],
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-pix_fmt", "yuv420p", "-vf", "scale='min(1280,iw)':-2",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000",
        seg,
      ]);
      listLines.push(`file '${seg.replace(/'/g, "'\\''")}'`);
      onProgress?.(2 + ((i + 1) / files.length) * 88);
    }
    const listFile = path.join(tempDir, "list.txt");
    await fs.writeFile(listFile, `${listLines.join("\n")}\n`, "utf8");
    onStage?.("concat", 90);
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-c", "copy", "-movflags", "+faststart", final,
    ]);
    duration = (await probeDuration(final)) ?? 0;
  }

  onStage?.("thumbnail", 96);
  const stamp = Math.max(1, Math.floor(duration * 0.1));
  try {
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(stamp), "-i", final, "-frames:v", "1", "-q:v", "3", thumb,
    ]);
  } catch (e) {
    log?.(`thumbnail failed: ${e instanceof Error ? e.message : e}`);
  }

  if (!duration) duration = (await probeDuration(final)) ?? 0;
  const stat = await fs.stat(final);
  onProgress?.(100);
  return { durationSec: duration, sizeBytes: stat.size, videoFile: final, thumbnailFile: thumb };
}

export async function fileSize(file) {
  try {
    const stat = await fs.stat(file);
    return stat.size;
  } catch {
    return 0;
  }
}

export { createReadStream };
