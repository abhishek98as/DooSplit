/**
 * Creates all DynamoDB tables needed by DooSplit.
 * Run with: npx tsx scripts/create-dynamodb-tables.ts
 * Idempotent — skips tables that already exist.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  type BillingMode,
} from "@aws-sdk/client-dynamodb";

const REGION = process.env.AWS_REGION ?? "eu-central-1";
const TABLE = process.env.DYNAMODB_TABLE ?? "doosplit";
const MIGRATION_TABLE = process.env.DYNAMODB_MIGRATION_TABLE ?? "doosplit_migration";
const LOCKS_TABLE = process.env.DYNAMODB_LOCKS_TABLE ?? "doosplit_locks";

const client = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function tableExists(name: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch {
    return false;
  }
}

async function createMainTable(): Promise<void> {
  const name = TABLE;
  if (await tableExists(name)) {
    console.log(`✓ Table '${name}' already exists — skipping`);
    return;
  }

  console.log(`Creating table '${name}' in ${REGION}…`);
  await client.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: "PAY_PER_REQUEST" as BillingMode,
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
        { AttributeName: "GSI2PK", AttributeType: "S" },
        { AttributeName: "GSI2SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "GSI2",
          KeySchema: [
            { AttributeName: "GSI2PK", KeyType: "HASH" },
            { AttributeName: "GSI2SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      // Enable TTL — attribute name must be "ttl" (configured separately below)
      // TTL is enabled via AWS Console or CLI: aws dynamodb update-time-to-live ...
    })
  );
  console.log(`✓ Created table '${name}'`);
}

async function createMigrationTable(): Promise<void> {
  const name = MIGRATION_TABLE;
  if (await tableExists(name)) {
    console.log(`✓ Table '${name}' already exists — skipping`);
    return;
  }

  console.log(`Creating table '${name}'…`);
  await client.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: "PAY_PER_REQUEST" as BillingMode,
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
    })
  );
  console.log(`✓ Created table '${name}'`);
}

async function createLocksTable(): Promise<void> {
  const name = LOCKS_TABLE;
  if (await tableExists(name)) {
    console.log(`✓ Table '${name}' already exists — skipping`);
    return;
  }

  console.log(`Creating table '${name}'…`);
  await client.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: "PAY_PER_REQUEST" as BillingMode,
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
    })
  );
  console.log(`✓ Created table '${name}'`);
}

async function enableTTL(tableName: string): Promise<void> {
  const { UpdateTimeToLiveCommand } = await import("@aws-sdk/client-dynamodb");
  try {
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: {
          AttributeName: "ttl",
          Enabled: true,
        },
      })
    );
    console.log(`✓ TTL enabled on '${tableName}' (attribute: ttl)`);
  } catch (err: any) {
    if (err?.message?.includes("already enabled") || err?.message?.includes("TimeToLive is already")) {
      console.log(`✓ TTL already enabled on '${tableName}'`);
    } else {
      console.warn(`⚠ TTL update on '${tableName}':`, err?.message || err);
    }
  }
}

async function main(): Promise<void> {
  console.log(`\n🚀 DooSplit DynamoDB Table Setup`);
  console.log(`   Region : ${REGION}`);
  console.log(`   Account: (from ~/.aws/credentials profile=${process.env.AWS_PROFILE ?? "default"})\n`);

  await createMainTable();
  await createMigrationTable();
  await createLocksTable();

  // Enable TTL on tables that use it
  if (await tableExists(TABLE)) {
    await enableTTL(TABLE);
  }

  console.log("\n✅ All tables ready.\n");
  console.log("Next steps:");
  console.log("  1. Set DATA_BACKEND=dynamodb in Vercel env and .env.local");
  console.log("  2. Run: npx tsx scripts/migrate-mongodb-to-dynamodb.ts");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
