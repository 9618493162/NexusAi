import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "../config/env";

// 32-byte key derived from ENCRYPTION_KEY (or JWT_SECRET as a safe fallback —
// both are server-only secrets of at least 32 chars, so the derivation is
// deterministic and never depends on user input).
const KEY = createHash("sha256").update(env.ENCRYPTION_KEY || env.JWT_SECRET).digest();

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

/**
 * Encrypt a secret at rest. Format: `iv.tag.ciphertext`, each base64url.
 * Every value gets a fresh random IV, so identical keys never collide.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64url")).join(".");
}

/**
 * Decrypt a secret produced by encryptSecret. Throws on tampering or a wrong
 * key (GCM authenticates the ciphertext), so a corrupted row surfaces loudly
 * instead of silently returning garbage.
 */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
