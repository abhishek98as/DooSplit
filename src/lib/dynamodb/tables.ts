/** Table names — override via env vars if needed */
export const TABLE = process.env.DYNAMODB_TABLE ?? "doosplit";
export const MIGRATION_TABLE =
  process.env.DYNAMODB_MIGRATION_TABLE ?? "doosplit_migration";
export const LOCKS_TABLE =
  process.env.DYNAMODB_LOCKS_TABLE ?? "doosplit_locks";

/** GSI index names */
export const GSI1 = "GSI1";
export const GSI2 = "GSI2";
/** Sparse multi-access: user name prefix, reminder-by-status, friendship-by-id */
export const GSI3 = "GSI3";
