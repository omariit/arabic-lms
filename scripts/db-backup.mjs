#!/usr/bin/env node
/** Encrypted PostgreSQL custom-format backup to Cloudflare R2. See docs/HARDENING-PLAN.md. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { decryptDump, encryptedFileSize, expiredObjects, parseEncryptionKey, safeDatabaseConfig, backupObjectKey } from "./db-backup-core.mjs";

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run") || !flags.has("--upload");
const applyRetention = flags.has("--apply-retention");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function r2Client() {
  const account = required("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
  });
}

async function runPgDump(config, output) {
  await new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--host", config.host,
      "--port", config.port, "--username", config.user, "--dbname", config.database, "--file", output], {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, PGPASSWORD: config.password, PGSSLMODE: config.sslmode },
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => reject(new Error(`Could not start pg_dump: ${error.message}`)));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}: ${stderr.slice(-1500)}`)));
  });
}

async function listOldBackups(client, bucket) {
  const objects = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/", ContinuationToken: token }));
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return expiredObjects(objects);
}

async function main() {
  const config = safeDatabaseConfig(required("DATABASE_URL"));
  const key = parseEncryptionKey(required("BACKUP_ENCRYPTION_KEY"));
  const bucket = required("R2_BUCKET_NAME");
  const client = r2Client();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "muqriah-db-backup-"));
  const dumpPath = path.join(tempDir, "database.dump");
  const encryptedPath = path.join(tempDir, "database.dump.enc");
  try {
    await runPgDump(config, dumpPath);
    await (await import("./db-backup-core.mjs")).encryptDump(dumpPath, encryptedPath, key);
    const size = await encryptedFileSize(encryptedPath);
    const objectKey = backupObjectKey();
    if (dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", wouldUpload: objectKey, bytes: size, retention: "would list only; no deletes" }));
      return;
    }
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: (await import("node:fs")).createReadStream(encryptedPath),
      ContentLength: size,
      ContentType: "application/octet-stream",
      Metadata: { encryption: "aes-256-gcm", format: "muqriaq-pg-custom-v1" },
    }));
    console.log(JSON.stringify({ uploaded: objectKey, bytes: size, encrypted: true }));

    const expired = await listOldBackups(client, bucket);
    if (!applyRetention) {
      console.log(JSON.stringify({ retentionMode: "dry-run", expiredCount: expired.length, keys: expired.map((o) => o.Key) }));
      return;
    }
    if (expired.length) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Quiet: true, Objects: expired.map((o) => ({ Key: o.Key })) } }));
    }
    console.log(JSON.stringify({ retentionMode: "applied", deletedCount: expired.length }));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--decrypt")) {
  const valueAfter = (flag) => {
    const index = process.argv.indexOf(flag);
    return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
      ? process.argv[index + 1]
      : undefined;
  };
  const input = valueAfter("--decrypt");
  const output = valueAfter("--output");
  if (!input || !output) throw new Error("Usage: node scripts/db-backup.mjs --decrypt <backup.dump.enc> --output <database.dump>");
  await decryptDump(input, output, parseEncryptionKey(required("BACKUP_ENCRYPTION_KEY")));
  console.log(`Decrypted backup to ${output}`);
} else {
  main().catch((error) => {
    console.error(`[db-backup] ${error instanceof Error ? error.message : "Backup failed"}`);
    process.exitCode = 1;
  });
}
