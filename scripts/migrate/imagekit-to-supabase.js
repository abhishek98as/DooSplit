#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { buildEnv, createSupabaseAdmin, parseArgs, writeJsonArtifact } = require("./_utils");

function basicAuthHeader(privateKey) {
  return `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;
}

async function listImageKitFiles({ privateKey, limit, skip }) {
  const url = new URL("https://api.imagekit.io/v1/files");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("skip", String(skip));
  url.searchParams.set("sort", "ASC_CREATED");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: basicAuthHeader(privateKey),
    },
  });

  if (!response.ok) {
    throw new Error(`ImageKit list failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function loadCheckpoint(filePath) {
  if (!fs.existsSync(filePath)) {
    return { processedFileIds: {}, cursor: { skip: 0 } };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveCheckpoint(filePath, checkpoint) {
  writeJsonArtifact(filePath, checkpoint);
}

async function uploadFromUrlToSupabase({
  supabase,
  bucket,
  sourceUrl,
  pathInBucket,
  contentType,
}) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucket)
    .upload(pathInBucket, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: true,
    });
  if (error) {
    throw error;
  }
}

function derivePath(file) {
  const normalized = String(file.filePath || "").replace(/^\/+/, "");
  if (normalized) {
    return normalized;
  }
  return `doosplit/migrated/${file.fileId}-${file.name}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = args["run-id"] || `image-backfill-${Date.now()}`;
  const batchSizeRaw = Number.parseInt(args["batch-size"] || "50", 10);
  const batchSize = Number.isFinite(batchSizeRaw) ? Math.max(1, Math.min(100, batchSizeRaw)) : 50;
  const checkpointPath = path.resolve(
    args.checkpoint || "docs/migration/image-backfill-checkpoint.json"
  );

  const env = buildEnv();
  const imageKitPrivateKey = env.IMAGEKIT_PRIVATE_KEY;
  if (!imageKitPrivateKey) {
    throw new Error("IMAGEKIT_PRIVATE_KEY is not configured");
  }

  const supabase = createSupabaseAdmin(env);
  const bucket = env.SUPABASE_STORAGE_BUCKET || "doosplit";
  const checkpoint = loadCheckpoint(checkpointPath);
  const processedFileIds = checkpoint.processedFileIds || {};
  let skip = Number(checkpoint.cursor?.skip || 0);

  const summary = {
    runId,
    bucket,
    batchSize,
    startedAt: new Date().toISOString(),
    processed: 0,
    skippedAlreadyProcessed: 0,
    failed: 0,
    failures: [],
  };

  while (true) {
    const files = await listImageKitFiles({
      privateKey: imageKitPrivateKey,
      limit: batchSize,
      skip,
    });

    if (!Array.isArray(files) || files.length === 0) {
      break;
    }

    for (const file of files) {
      if (processedFileIds[file.fileId]) {
        summary.skippedAlreadyProcessed += 1;
        continue;
      }

      try {
        const pathInBucket = derivePath(file);
        await uploadFromUrlToSupabase({
          supabase,
          bucket,
          sourceUrl: file.url,
          pathInBucket,
          contentType: file.mime || "application/octet-stream",
        });

        processedFileIds[file.fileId] = {
          path: pathInBucket,
          uploadedAt: new Date().toISOString(),
        };
        summary.processed += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          fileId: file.fileId,
          name: file.name,
          error: error?.message || "Unknown error",
        });
      }
    }

    skip += files.length;
    saveCheckpoint(checkpointPath, {
      processedFileIds,
      cursor: { skip },
      updatedAt: new Date().toISOString(),
    });

    if (files.length < batchSize) {
      break;
    }
  }

  summary.finishedAt = new Date().toISOString();
  const outPath = path.resolve("docs", "migration", `${runId}-image-backfill.json`);
  writeJsonArtifact(outPath, summary);
  console.log(JSON.stringify({ ...summary, artifact: outPath, checkpoint: checkpointPath }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error.message,
      },
      null,
      2
    )
  );
  process.exit(1);
});
