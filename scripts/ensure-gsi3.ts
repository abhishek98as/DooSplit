/**
 * Ensure GSI3 exists on the doosplit table and backfill sparse keys for:
 * - users (NAME / name_normalized#userId)
 * - payment_reminders (REMSTATUS#status / ts#id)
 * - friendships forward edges (FID#id / USER#userId)
 *
 * Run: npx tsx scripts/ensure-gsi3.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  DynamoDBClient,
  DescribeTableCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "eu-central-1";
const TABLE = process.env.DYNAMODB_TABLE ?? "doosplit";

const base = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const doc = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true },
});

function toSortableTs(d: string): string {
  const date = new Date(d);
  return date.toISOString().replace(/[:.]/g, "-");
}

async function ensureGsi3(): Promise<void> {
  const desc = await base.send(new DescribeTableCommand({ TableName: TABLE }));
  const existing = desc.Table?.GlobalSecondaryIndexes?.map((g) => g.IndexName) || [];
  if (existing.includes("GSI3")) {
    console.log("✓ GSI3 already present");
    return;
  }

  console.log("Creating GSI3 on", TABLE, "…");
  await base.send(
    new UpdateTableCommand({
      TableName: TABLE,
      AttributeDefinitions: [
        { AttributeName: "GSI3PK", AttributeType: "S" },
        { AttributeName: "GSI3SK", AttributeType: "S" },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: "GSI3",
            KeySchema: [
              { AttributeName: "GSI3PK", KeyType: "HASH" },
              { AttributeName: "GSI3SK", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        },
      ],
    })
  );

  console.log("Waiting for GSI3 to become ACTIVE…");
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const d = await base.send(new DescribeTableCommand({ TableName: TABLE }));
    const gsi = d.Table?.GlobalSecondaryIndexes?.find((g) => g.IndexName === "GSI3");
    const status = gsi?.IndexStatus;
    console.log("  GSI3 status:", status);
    if (status === "ACTIVE") break;
    if (status === "CREATING" || status === "UPDATING") continue;
    if (!status) throw new Error("GSI3 missing after create");
  }
  console.log("✓ GSI3 ACTIVE");
}

async function scanEntity(entityType: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "entityType = :et",
        ExpressionAttributeValues: { ":et": entityType },
        ExclusiveStartKey,
      })
    );
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function backfill(): Promise<void> {
  const users = await scanEntity("user");
  console.log(`Backfilling ${users.length} users…`);
  for (const u of users) {
    const nameNorm = String(u.name_normalized || "").toLowerCase();
    const id = String(u.id || "");
    if (!id) continue;
    await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: u.PK, SK: u.SK },
        UpdateExpression: "SET GSI3PK = :pk, GSI3SK = :sk",
        ExpressionAttributeValues: {
          ":pk": "NAME",
          ":sk": `${nameNorm}#${id}`,
        },
      })
    );
  }

  const reminders = await scanEntity("payment_reminder");
  console.log(`Backfilling ${reminders.length} payment_reminders…`);
  for (const r of reminders) {
    const status = String(r.status || "sent");
    const id = String(r.id || "");
    const ts = toSortableTs(String(r.created_at || new Date().toISOString()));
    if (!id) continue;
    await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: r.PK, SK: r.SK },
        UpdateExpression: "SET GSI3PK = :pk, GSI3SK = :sk",
        ExpressionAttributeValues: {
          ":pk": `REMSTATUS#${status}`,
          ":sk": `${ts}#${id}`,
        },
      })
    );
  }

  const friendships = await scanEntity("friendship");
  // Forward edge only: user_id is the PK owner and matches requested storage convention
  // Prefer edges where GSI3 not set; use unique friendship id once
  const seenIds = new Set<string>();
  let fidCount = 0;
  console.log(`Backfilling friendships (${friendships.length} edges)…`);
  for (const f of friendships) {
    const id = String(f.id || "");
    const userId = String(f.user_id || "");
    if (!id || !userId || seenIds.has(id)) continue;
    // Prefer the edge where user_id matches requested_by or simply first occurrence
    seenIds.add(id);
    await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: f.PK, SK: f.SK },
        UpdateExpression: "SET GSI3PK = :pk, GSI3SK = :sk",
        ExpressionAttributeValues: {
          ":pk": `FID#${id}`,
          ":sk": `USER#${userId}`,
        },
      })
    );
    fidCount += 1;
  }
  console.log(`✓ Friendship FID keys: ${fidCount}`);
}

async function main() {
  console.log(`\nDooSplit GSI3 ensure`);
  console.log(`  Table : ${TABLE}`);
  console.log(`  Region: ${REGION}\n`);
  await ensureGsi3();
  await backfill();
  console.log("\n✅ GSI3 ready and backfilled.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
