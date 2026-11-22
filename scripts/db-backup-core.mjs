import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

export const BACKUP_MAGIC = Buffer.from("MUQRIQ1\0", "ascii");
export const BACKUP_IV_BYTES = 12;
export const BACKUP_TAG_BYTES = 16;
export const RETENTION_DAYS = 14;

export function parseEncryptionKey(value) {
  if (typeof value !== "string" || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)");
  }
  return Buffer.from(value, "hex");
}

/** Parse DATABASE_URL without ever logging its credentials. */
export function safeDatabaseConfig(rawUrl) {
  if (!rawUrl) throw new Error("DATABASE_URL is required");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }
  if (!url.hostname || !url.pathname.slice(1)) throw new Error("DATABASE_URL must include a host and database name");
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    sslmode: url.searchParams.get("sslmode") || "require",
  };
}

export function backupObjectKey(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `backups/${stamp}.dump.enc`;
}

export function expiredObjects(objects, now = Date.now(), retentionDays = RETENTION_DAYS) {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  return objects.filter((item) => {
    const time = item.LastModified instanceof Date ? item.LastModified.getTime() : Date.parse(item.LastModified ?? "");
    return Number.isFinite(time) && time < cutoff && typeof item.Key === "string" &&
      item.Key.startsWith("backups/") && item.Key.endsWith(".dump.enc");
  });
}

/** Encrypt a pg_dump file using a versioned, authenticated AES-256-GCM stream format. */
export async function encryptDump(inputPath, outputPath, key) {
  const iv = randomBytes(BACKUP_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const temporary = `${outputPath}.${randomBytes(8).toString("hex")}.partial`;
  try {
    await writeFile(temporary, Buffer.concat([BACKUP_MAGIC, iv]), { flag: "wx", mode: 0o600 });
    await pipeline(createReadStream(inputPath), cipher, createWriteStream(temporary, { flags: "a", mode: 0o600 }));
    await appendFile(temporary, cipher.getAuthTag());
    await rename(temporary, outputPath); // publish only a complete, authenticated backup
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Decrypt a dump file; GCM authentication rejects wrong keys and tampering. */
export async function decryptDump(inputPath, outputPath, key) {
  const input = await open(inputPath, "r");
  let iv;
  let tag;
  let size;
  try {
    size = (await input.stat()).size;
    const header = Buffer.alloc(BACKUP_MAGIC.length + BACKUP_IV_BYTES);
    if (size < header.length + BACKUP_TAG_BYTES) throw new Error("Encrypted backup is truncated");
    await input.read(header, 0, header.length, 0);
    if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) throw new Error("Unknown backup format");
    iv = header.subarray(BACKUP_MAGIC.length);
    tag = Buffer.alloc(BACKUP_TAG_BYTES);
    await input.read(tag, 0, tag.length, size - BACKUP_TAG_BYTES);
  } finally {
    await input.close();
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const temporary = `${outputPath}.${randomBytes(8).toString("hex")}.partial`;
  try {
    await pipeline(
      createReadStream(inputPath, { start: BACKUP_MAGIC.length + BACKUP_IV_BYTES, end: size - BACKUP_TAG_BYTES - 1 }),
      decipher,
      createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    await rename(temporary, outputPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function encryptedFileSize(file) {
  return (await stat(file)).size;
}
