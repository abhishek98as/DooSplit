import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { S3Client, CreateBucketCommand, PutBucketCorsCommand, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "eu-central-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  const bucketName = "doosplit-uploads";

  // Step 1: Create bucket
  try {
    await s3.send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: { LocationConstraint: process.env.AWS_REGION || "eu-central-1" },
    }));
    console.log(`✅ Bucket "${bucketName}" created`);
  } catch (e: any) {
    if (e.name === "BucketAlreadyOwnedByYou" || e.name === "BucketAlreadyExists") {
      console.log(`✅ Bucket "${bucketName}" already exists`);
    } else {
      console.error("❌ Bucket creation failed:", e.message);
      process.exit(1);
    }
  }

  // Step 2: Configure CORS
  await s3.send(new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [{
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "POST", "DELETE"],
        AllowedOrigins: ["https://doosplit.vercel.app", "http://localhost:3000"],
        ExposeHeaders: ["ETag", "x-amz-server-side-encryption"],
        MaxAgeSeconds: 3600,
      }],
    },
  }));
  console.log("✅ CORS configured");

  // Step 3: Block public access (secure by default — use pre-signed URLs)
  await s3.send(new PutPublicAccessBlockCommand({
    Bucket: bucketName,
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: true,
      RestrictPublicBuckets: true,
    },
  }));
  console.log("✅ Public access blocked (secure)");

  console.log(`\n🎉 S3 setup complete!`);
  console.log(`   Bucket: ${bucketName}`);
  console.log(`   Region: ${process.env.AWS_REGION || "eu-central-1"}`);
  console.log(`   Access: Pre-signed URLs only`);
}

main();
