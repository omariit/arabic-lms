import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { _Object } from "@aws-sdk/client-s3";
import {
  BACKUP_MAGIC,
  backupObjectKey,
  decryptDump,
  encryptDump,
  expiredObjects,
  parseEncryptionKey,
  safeDatabaseConfig,
} from "../scripts/db-backup-core.mjs";

let dir = "";
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = "";
});

async function temp() {
  dir = await mkdtemp(path.join(os.tmpdir(), "muqriah-backup-test-"));
  return dir;
}

const keyHex = "0a".repeat(32);

describe("encrypted database backups", () => {
  it("validates a 256-bit encryption key without echoing it", () => {
    expect(parseEncryptionKey(keyHex)).toHaveLength(32);
    expect(() => parseEncryptionKey("not-a-secret"))
      .toThrow("BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)");
  });

  it("parses postgres URLs without exposing credentials in errors", () => {
    expect(safeDatabaseConfig("postgresql://safe-user:secret-pass@db.example:6432/railway?sslmode=require"))
      .toMatchObject({ host: "db.example", port: "6432", user: "safe-user", password: "secret-pass", database: "railway", sslmode: "require" });
    expect(() => safeDatabaseConfig("mysql://u:secret@db.example/db")).toThrow("DATABASE_URL must use postgres:// or postgresql://");
    expect(() => safeDatabaseConfig(undefined)).toThrow("DATABASE_URL is required");
  });

  it("uses a timestamped encrypted backup key", () => {
    expect(backupObjectKey(new Date("2026-11-22T10:20:30.000Z"))).toBe("backups/2026-11-22T10-20-30-000Z.dump.enc");
  });

  it("selects only backup objects older than fourteen days", () => {
    const now = Date.parse("2026-11-22T00:00:00Z");
    const old = new Date(now - 15 * 86400000);
    const fresh = new Date(now - 3 * 86400000);
    const objects: _Object[] = [
      { Key: "backups/old.dump.enc", LastModified: old },
      { Key: "backups/fresh.dump.enc", LastModified: fresh },
      { Key: "other/old.dump.enc", LastModified: old },
      { Key: "backups/legacy.dump", LastModified: old },
    ];
    expect(expiredObjects(objects, now).map((o: _Object) => o.Key)).toEqual(["backups/old.dump.enc"]);
  });

  it("encrypts and decrypts a custom dump byte-for-byte with authenticated encryption", async () => {
    const root = await temp();
    const original = path.join(root, "original.dump");
    const encrypted = path.join(root, "backup.dump.enc");
    const restored = path.join(root, "restored.dump");
    const bytes = Buffer.from("pg custom dump fixture\0\xff".repeat(1000));
    await writeFile(original, bytes);
    await encryptDump(original, encrypted, parseEncryptionKey(keyHex));
    const cipher = await readFile(encrypted);
    expect(cipher.subarray(0, BACKUP_MAGIC.length)).toEqual(BACKUP_MAGIC);
    expect(cipher).not.toContain(bytes.subarray(0, 15));
    await decryptDump(encrypted, restored, parseEncryptionKey(keyHex));
    expect(await readFile(restored)).toEqual(bytes);
  });

  it("rejects a wrong key and removes the partial plaintext output", async () => {
    const root = await temp();
    const original = path.join(root, "original.dump");
    const encrypted = path.join(root, "backup.dump.enc");
    const restored = path.join(root, "restored.dump");
    await writeFile(original, Buffer.from("sensitive database dump"));
    await encryptDump(original, encrypted, parseEncryptionKey(keyHex));
    await expect(decryptDump(encrypted, restored, parseEncryptionKey("0b".repeat(32)))).rejects.toThrow();
    await expect(readFile(restored)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
