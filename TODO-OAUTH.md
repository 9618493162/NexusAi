# Google & GitHub OAuth Implementation

## Backend
- [x] 1. Install passport + passport-google-oauth20 + passport-github2 + types
- [x] 2. Update Prisma schema — add githubId + provider fields
- [x] 3. Update env.ts — add GitHub OAuth env vars, make them required
- [x] 4. Create `backend/src/config/passport.ts` — Google + GitHub strategies
- [x] 5. Update `auth.service.ts` — add OAuth login/create logic
- [x] 6. Update `auth.controller.ts` — add OAuth callback handlers
- [x] 7. Update `auth.routes.ts` — add OAuth auth routes
- [x] 8. Update `app.ts` — initialize passport

## Frontend
- [x] 9. Create OAuth callback page `frontend/src/pages/OAuthCallback.tsx`
- [x] 10. Update `App.tsx` — add OAuth callback route

## Finalize
- [x] 11. Run prisma db push to apply schema changes
- [x] 12. Test the flow
