import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "eu-central-1";

let _baseClient: DynamoDBClient | null = null;
let _docClient: DynamoDBDocumentClient | null = null;

function buildBaseClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: REGION,
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
