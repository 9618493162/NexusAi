import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

// Supabase's direct connection (`db.*.supabase.co:5432`) is IPv6-only and can
// drop transiently on some networks (VPNs, hotspots, Teredo transitions).
// Prisma reports this as "Can't reach database server" (P1001) — retry a few
// times with backoff so a momentary drop doesn't surface to the user.
// Only pre-connect failures (P1001/P1002) are retried: by then nothing was
// sent to the server, so retrying a write can't double-commit.
const RETRYABLE_CODES = new Set(["P1001", "P1002"]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 250;

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_CODES.has(error.code);
  }
  return error instanceof Prisma.PrismaClientInitializationError;
}

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

  return base.$extends({
    query: {
      async $allOperations({ query, args }) {
        let attempt = 0;
        for (;;) {
          try {
            return await query(args);
          } catch (error) {
            if (!isRetryable(error) || attempt >= MAX_RETRIES) throw error;
            attempt += 1;
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          }
        }
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
