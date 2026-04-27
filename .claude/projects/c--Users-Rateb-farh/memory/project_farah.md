---
name: Project Farah (فرح)
description: Arabic event/services marketplace being converted from frontend-only to full-stack
type: project
---

Farah (فرح) is a multi-platform Arabic event-services marketplace — connects customers booking weddings/events with service providers (poets, photographers, halls, caterers, etc.).

**Why:** Owner wants a real production system, not just UI. All data dynamic from DB; no hardcoded content; full multi-platform (iOS/Android/Web/Windows); AR + EN with proper RTL; real auth + push notifications + admin panel.

**How to apply:** When working on this project, assume the goal is a production-ready system. Do not add hardcoded user data, mock services, or "demo" code paths (the previous demo OTP `1234` and email-based role mapping in AuthContext are being removed).

**Project structure:**
- `artifacts/farah/` — Expo app (iOS/Android/Web), React Native 0.81, Expo Router, Cairo font, purple theme `#7b2cbf`
- `artifacts/api-server/` — Express 5 (currently minimal: only `/health`)
- `lib/db/` — Drizzle ORM + PostgreSQL schemas
- `lib/api-spec/openapi.yaml` — OpenAPI spec; Orval generates `lib/api-client-react/` React Query hooks
- `attached_assets/farah_supabase_schema.sql` — full Supabase schema (users, categories, providers, services, bookings, reviews, notifications, app_settings) with RLS policies + seed data
- pnpm monorepo, Node 24, TypeScript 5.9, 1-day minimum release age (supply-chain defense)

**Owner email mapping (being removed):** previous AuthContext had hardcoded role-by-email map for `r3567089@gmail.com` (admin), `rateb@lazywait.com` (provider), `developmentservices.sa@gmail.com` (customer). Real roles come from `users.role` column post-rebuild.
