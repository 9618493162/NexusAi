import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { env } from "./env";
import { findOrCreateOAuthUser } from "../services/auth.service";
import { logger } from "./logger";

export interface OAuthProfile {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  provider: "google" | "github";
}

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) => {
      try {
        const result = await findOrCreateOAuthUser({
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value,
          provider: "google",
        });
        done(null, { ...result.user, tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken } });
      } catch (error) {
        logger.error("Google OAuth error:", error);
        done(error as Error);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: env.GITHUB_CLIENT_ID || "",
      clientSecret: env.GITHUB_CLIENT_SECRET || "",
      callbackURL: "/api/auth/github/callback",
    },
    async (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) => {
      try {
        const result = await findOrCreateOAuthUser({
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value,
          provider: "github",
        });
        done(null, { ...result.user, tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken } });
      } catch (error) {
        logger.error("GitHub OAuth error:", error);
        done(error as Error);
      }
    }
  )
);

export default passport;
