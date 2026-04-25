# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifact: farah (Expo mobile + web)

Arabic RTL event/celebration services app. Purple theme (#7b2cbf).

- **Font**: Cairo (Google Fonts via `@expo-google-fonts/cairo`)
- **Auth**: email or phone identifier with OTP `1234` (demo). Predefined role mapping by email:
  - `r3567089@gmail.com` → admin (مالك المشروع)
  - `rateb@lazywait.com` → provider (راتب — مزود الخدمة)
  - `developmentservices.sa@gmail.com` → customer (ضيفنا الكريم)
  - For unknown phones, last digit determines role: `0`=admin, `1|2`=provider, else customer.
- **Supabase**: client at `lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. SQL schema for tables/RLS lives at `attached_assets/farah_supabase_schema.sql` — run it in the Supabase SQL editor before migrating data from local AsyncStorage.
