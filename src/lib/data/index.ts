export * from "./config";
export * from "./types";
export { dynamodbReadRepository } from "./dynamodb-adapter";

/** Always returns the DynamoDB read repository. */
export async function getActiveRepository() {
  return dynamodbReadRepository;
}
