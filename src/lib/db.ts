import mongoose from "mongoose";

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

/**
 * Check if the existing connection is still healthy
 */
function isConnectionHealthy(): boolean {
  if (!cached.conn) return false;
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const state = cached.conn.connection.readyState;
  return state === 1; // Only consider "connected" as healthy
}

async function dbConnect(): Promise<typeof mongoose> {
  // If we have a cached connection and it's still healthy, reuse it
  if (cached.conn && isConnectionHealthy()) {
    return cached.conn;
  }

  // If the connection exists but is unhealthy, reset it
  if (cached.conn && !isConnectionHealthy()) {
    console.log("⚠️ MongoDB connection unhealthy (state:", cached.conn.connection.readyState, "), reconnecting...");
    cached.conn = null;
    cached.promise = null;
  }

  // Read MONGODB_URI at runtime, not at module import time
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI environment variable is not defined. Set it in .env.local or Vercel environment variables."
    );
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      family: 4, // Force IPv4 - helps with Atlas connectivity
      retryWrites: true,
      retryReads: true,
    };

    console.log("🔄 Connecting to MongoDB...");
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log("✅ MongoDB connected successfully to:", mongoose.connection.host);

      // Listen for connection errors after initial connect
      mongoose.connection.on("error", (err) => {
        console.error("❌ MongoDB connection error:", err.message);
        cached.conn = null;
        cached.promise = null;
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("⚠️ MongoDB disconnected, will reconnect on next request");
        cached.conn = null;
        cached.promise = null;
      });

      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e: any) {
    cached.promise = null;
    cached.conn = null;
    console.error("❌ MongoDB connection failed:", e.message);
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
