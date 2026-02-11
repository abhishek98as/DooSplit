import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

type RedisConnection = {
  client: RedisClient | null;
  connectPromise: Promise<RedisClient | null> | null;
  disabled: boolean;
  disabledAt: number;
};

// Retry connecting after 60 seconds of being disabled
const RETRY_AFTER_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __redisConnection: RedisConnection | undefined;
}

const globalConnection: RedisConnection = global.__redisConnection || {
  client: null,
  connectPromise: null,
  disabled: false,
  disabledAt: 0,
};

if (!global.__redisConnection) {
  global.__redisConnection = globalConnection;
}

function buildRedisConfig() {
  const url = process.env.REDIS_URL;
  if (url) {
    return { url };
  }

  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined;

  if (!host || !port) {
    return null;
  }

  return {
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
      host,
      port,
      tls: process.env.REDIS_TLS === "true",
      connectTimeout: 5000,
      keepAlive: 5000,
    },
  };
}

export async function getRedisClient(): Promise<RedisClient | null> {
  // If disabled, check if enough time has passed to retry
  if (globalConnection.disabled) {
    if (Date.now() - globalConnection.disabledAt < RETRY_AFTER_MS) {
      return null;
    }
    // Reset disabled state to allow retry
    globalConnection.disabled = false;
    globalConnection.disabledAt = 0;
    globalConnection.client = null;
  }

  if (globalConnection.client?.isOpen) {
    return globalConnection.client;
  }

  if (globalConnection.connectPromise) {
    return globalConnection.connectPromise;
  }

  const config = buildRedisConfig();
  if (!config) {
    globalConnection.disabled = true;
    globalConnection.disabledAt = Date.now();
    return null;
  }

  const client = createClient(config);

  client.on("error", (error) => {
    console.error("Redis client error:", error.message);
  });

  globalConnection.connectPromise = (async () => {
    try {
      await client.connect();
      globalConnection.client = client;
      return client;
    } catch (error: any) {
      console.error("Redis connection failed, caching disabled for 60s:", error.message);
      globalConnection.disabled = true;
      globalConnection.disabledAt = Date.now();
      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch {
        // Ignore close errors during fallback.
      }
      return null;
    } finally {
      globalConnection.connectPromise = null;
    }
  })();

  return globalConnection.connectPromise;
}
