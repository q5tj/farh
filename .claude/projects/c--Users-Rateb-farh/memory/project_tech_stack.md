---
name: Tech Stack Decisions
description: Confirmed tech choices for Farah full-stack rebuild
type: project
---

Confirmed by owner on 2026-04-26:

- **Backend / DB / Auth:** Supabase — schema already designed at `attached_assets/farah_supabase_schema.sql` with RLS policies. Faster than building Express+Postgres from scratch. Existing `lib/db/` Drizzle schemas can mirror Supabase tables for type-safety.
- **Push Notifications:** Expo Push (free, single API for iOS+Android+Web). Need a `push_tokens` table.
- **i18n:** `i18next` + `react-i18next` (AR + EN). Replace hardcoded `constants/strings.ts`. Fix RTL issue on web (currently uses `direction: rtl` on root + `forceRTL(true)` on native — needs proper toggle when language changes).

**Why these choices:** Supabase has the schema ready and provides Auth + DB + Storage + Realtime in one. Expo Push works on all three platforms via one endpoint. i18next is the standard for React/RN apps and supports dynamic RTL.

**How to apply:** When implementing features, prefer Supabase client SDK calls + RLS over building custom Express endpoints — only use the api-server for things RLS can't enforce (e.g., admin-only push broadcast triggering Expo Push API with the server key).

**Auth specifics agreed:**
- Two flows only: signup (email + password) and login (email + password). Phone-based auth removed.
- Signup sends a 6-digit verification OTP to email (Supabase `signUp` then `verifyOtp` with `type: 'signup'`).
- After first verified login, app forces user through profile-setup screen (name, phone, avatar, gender, age, language). `users.profile_completed` flag gates app usage.
- Red dot on "بياناتي" row in profile screen until completed.
