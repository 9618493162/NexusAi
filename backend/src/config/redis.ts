import Redis from "ioredis";
import { env } from "./env";

export const redis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;

export async function getRedisClient() {
  if (!redis) throw new Error("Redis not configured");
  return redis;
}
