import jwt, { JsonWebTokenError, TokenExpiredError, JwtPayload } from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

export interface AuthPayload extends JwtPayload {
  userId: string;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
}

export function generateAccessToken(payload: Omit<AuthPayload, "iat" | "exp">): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(payload: Omit<AuthPayload, "iat" | "exp">): string {
  // Unique jti guarantees no two tokens collide, even when parallel requests
  // are signed within the same second (iat has second precision). Refresh tokens
  // are stored in the DB with a unique constraint.
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
    jwtid: crypto.randomUUID(),
  });
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
}

export function verifyRefreshToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthPayload;
}

export function isJwtError(error: unknown): error is JsonWebTokenError | TokenExpiredError {
  return error instanceof JsonWebTokenError || error instanceof TokenExpiredError;
}
