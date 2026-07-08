import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";

const REGION = process.env.AWS_REGION ?? "eu-central-1";

let _baseClient: DynamoDBClient | null = null;
let _docClient: DynamoDBDocumentClient | null = null;

function buildBaseClient(): DynamoDBClient {
  // Connection pooling with keep-alive — critical for serverless cold starts
  // Without this, every DynamoDB request does a fresh TLS handshake (~50-80ms)
  const httpAgent = process.env.NODE_ENV === "development"
    ? undefined  // Don't pool in dev — avoids connection issues on hot reload
    : new NodeHttpHandler({
        connectionTimeout: 3000,   // Fail fast if can't connect (3s)
        socketTimeout: 5000,       // Socket-level timeout (5s)
        httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 50 }),
        httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 50 }),
      });

  return new DynamoDBClient({
    region: REGION,
    maxAttempts: 3,  // Retry up to 3 times with exponential backoff
    requestHandler: httpAgent,
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
}

/** DocumentClient singleton — use for all app reads/writes */
export function getDynamoDB(): DynamoDBDocumentClient {
  if (!_docClient) {
    if (!_baseClient) _baseClient = buildBaseClient();
    _docClient = DynamoDBDocumentClient.from(_baseClient, {
      marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
      unmarshallOptions: { wrapNumbers: false },
    });
  }
  return _docClient;
}

/** Raw client — used only by table-creation scripts */
export function getRawDynamoDB(): DynamoDBClient {
  if (!_baseClient) _baseClient = buildBaseClient();
  return _baseClient;
}
