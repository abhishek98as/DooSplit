export * from "./config";
export * from "./types";

// MongoDB backend (primary)
export { mongodbReadRepository } from "./mongodb-adapter";

// DynamoDB backend
export { dynamodbReadRepository } from "./dynamodb-adapter";

// Backward-compat alias — firestoreReadRepository now points to MongoDB
export { mongodbReadRepository as firestoreReadRepository } from "./mongodb-adapter";

/**
 * Returns the active ReadRepository based on DATA_BACKEND env var.
 * Use this in API routes instead of importing a specific adapter directly.
 */
export async function getActiveRepository() {
  const { getDataBackendMode } = await import("./config");
  const mode = getDataBackendMode();
  if (mode === "dynamodb") {
    const { dynamodbReadRepository } = await import("./dynamodb-adapter");
    return dynamodbReadRepository;
  }
  if (mode === "firestore") {
    const { firestoreReadRepository } = await import("./firestore-adapter");
    return firestoreReadRepository;
  }
  const { mongodbReadRepository } = await import("./mongodb-adapter");
  return mongodbReadRepository;
}
