import { dynamodbReadRepository } from "./dynamodb-adapter";

export * from "./config";
export * from "./types";
export { dynamodbReadRepository };

/** Always returns the DynamoDB read repository. */
export async function getActiveRepository() {
  return dynamodbReadRepository;
}
