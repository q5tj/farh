---
name: Phase 4 Decisions (Services + Providers)
description: Owner-confirmed design decisions for Phase 4 — provider onboarding, services CRUD, image storage
type: project
---

Confirmed by owner on 2026-04-26 before starting Phase 4:

**1. Role selection at signup:**
- After OTP/signup, before profile-setup, the user picks **Customer** or **Service Provider**.
- Customer flow: existing profile-setup (name, phone, avatar, gender, age, language).
- Provider flow: a longer onboarding form. Required fields:
  - Logo / profile image
  - Display name (AR + EN)
  - Phone number
  - Commercial Registration (السجل التجاري) — required
  - VAT number (الرقم الضريبي) — optional
  - Activity type / category (from existing 20 categories — single select; this becomes `providers.category_id`)
- Onboarding screen must show a **commission notice**: "تُحسب عمولة منصة على كل عملية بيع من خلال فرح" — pull rate from `app_settings.commission_rate` so it stays current. Show in both AR + EN.
- Owner asked us to "rearrange and present nicely" — group fields into sections (Identity / Business / Activity), use card-based layout consistent with profile-setup.

**Why:** Owner wants providers to commit to the platform terms (commission) consciously, and to differentiate flow from regular customers. Real CR enables future verification/legal compliance.

**How to apply:** Implement role picker as a separate gate screen between OTP and profile-setup. Persist role to `users.role` immediately on selection (so AuthGate routes correctly afterward). Provider onboarding writes to BOTH `public.users` (basic profile) AND `public.providers` (business record) in one save action.

---

**2. Service categorization:**
- A provider's services must all belong to **the provider's own primary category** (no cross-category services).
- Implementation: when listing categories in the "Add Service" form, filter to only the provider's `category_id`. Or omit the picker entirely and auto-assign the provider's category.

**Why:** Matches original product intent (a "wedding hall" provider sells halls, not flowers). Simpler UX and better browsing.

---

**3. Service images:**
- Upload to Supabase Storage (like avatars).
- Need a new Storage bucket: `service-images` (public).
- Path convention: `service-images/{provider_id}/{service_id}/{timestamp}.{ext}`
- Multiple images per service (carousel). Stored in `services.images text[]` (column already added in migration v2).

**How to apply:** Reuse the avatar upload pattern from `profile-setup.tsx`. Build a small `ImagePickerGrid` component for multi-image upload + reorder + delete.

---

**Open items deferred to later phases:**
- Provider verification by admin (review CR/VAT) — Phase 7 (admin panel).
- Commission deduction on actual transactions — Phase 5 (booking flow with payment status).
- Search across AR/EN bilingual fields — Phase 4, but use simple ILIKE for now; full-text search later.
