/** DynamoDB-only — MongoDB client removed. */
export async function getMongoDb() {
  throw new Error("MongoDB has been removed. Use DynamoDB instead.");
}
export function getMongooseInstance() {
  throw new Error("MongoDB has been removed. Use DynamoDB instead.");
}
export async function disconnectMongoDb() {}
