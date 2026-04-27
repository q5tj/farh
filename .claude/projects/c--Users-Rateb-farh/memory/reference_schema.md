---
name: Schema Reference
description: Where the Farah Supabase schema lives and how it's evolving
type: reference
---

**Original schema:** `attached_assets/farah_supabase_schema.sql` — full PostgreSQL schema with RLS policies, triggers, and seed data for 20 categories. Run this in Supabase SQL editor first.

**Migration for Phase 1+2:** `attached_assets/farah_supabase_migration_v2.sql` — adds:
- `users.email`, `users.avatar_url`, `users.gender`, `users.age`, `users.language`, `users.profile_completed`
- `categories.name_ar`, `categories.name_en`
- `services.title_ar`, `title_en`, `description_ar`, `description_en`
- `providers.name_ar`, `name_en`, `description_ar`, `description_en`
- New tables: `push_tokens`, `support_tickets`, `app_content`
- Trigger: auto-create `public.users` row when `auth.users` row inserted

**Drizzle mirror:** `lib/db/` should be kept in sync with these tables for type-safety (not yet done — task for later phase).
