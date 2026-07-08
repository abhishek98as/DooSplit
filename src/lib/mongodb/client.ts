import "server-only";
import mongoose, { type Connection } from "mongoose";

let cachedConnection: Connection | null = null;
let connectionPromise: Promise<Connection> | null = null;

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "doosplit";
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD || "";

/**
 * Returns the resolved MongoDB URI with password interpolated.
 * Supports both:
 *   1. Full URI in MONGODB_URI (password already in string)
 *   2. URI with <db_password> placeholder + MONGODB_PASSWORD env var
 */
function resolveMongoUri(): string {
  if (!MONGODB_URI) return "";
  let uri = MONGODB_URI;
  if (uri.includes("<db_password>") && MONGODB_PASSWORD) {
    uri = uri.replace("<db_password>", encodeURIComponent(MONGODB_PASSWORD));
  }
  return uri;
}

export async function getMongoDb(): Promise<Connection> {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local or your Vercel environment variables. " +
      "Format: mongodb+srv://<user>:<password>@cluster0.c94me0z.mongodb.net/doosplit?appName=Cluster0"
    );
  }
  // Return cached connection if alive
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  // If already connected via a previous call in the same process
  if (mongoose.connection.readyState === 1) {
    cachedConnection = mongoose.connection;
    return cachedConnection;
  }

  // Prevent concurrent connection attempts (serverless race condition)
  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = resolveMongoUri();

  connectionPromise = mongoose.connect(uri, {
    dbName: MONGODB_DB_NAME,
    // Atlas Stable API v1 — ensures forward compatibility
    serverApi: {
      version: "1" as const,
      strict: true,
      deprecationErrors: true,
    },
    // Serverless-friendly: keep pool small, rely on warm connections
    // Atlas M0/M2/M5 clusters have connection limits; 5 is safe
    maxPoolSize: 5,
    minPoolSize: 1,
    // Connections idle longer than this get pruned (serverless consideration)
    maxIdleTimeMS: 30_000,
    // Timeouts for serverless cold starts
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 10_000,
    // Retry reads on transient errors
    retryReads: true,
    retryWrites: true,
    // Write concern for Atlas
    w: "majority" as const,
  }) as unknown as Promise<Connection>;

  try {
    const conn = await connectionPromise;
    cachedConnection = conn;
    connectionPromise = null;
    return cachedConnection;
  } catch (err) {
    connectionPromise = null;
    throw err;
  }
}

/**
 * Returns the underlying mongoose instance for use in transactions and direct
 * driver access. Most callers should use Mongoose models instead.
 */
export function getMongooseInstance() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB not connected. Call getMongoDb() first.");
  }
  return mongoose;
}

/**
 * Disconnect — only needed in tests or graceful shutdown scenarios.
 * Serverless functions should NOT call this in normal operation.
 */
export async function disconnectMongoDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cachedConnection = null;
  }
}
