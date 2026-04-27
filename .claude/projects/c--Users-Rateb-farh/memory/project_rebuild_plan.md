---
name: Full-Stack Rebuild Plan
description: 8-phase plan to convert Farah from frontend-only to production
type: project
---

Agreed plan on 2026-04-26: deliver in phases, verify each phase works before starting the next.

| Phase | Scope |
|---|---|
| 1 | Setup: Supabase project, schema migration, env vars |
| 2 | Auth: signup (email+pwd+OTP), login (email+pwd), profile-completion gate, red dot indicator |
| 3 | i18n: AR/EN with i18next, web RTL fix |
| 4 | Services + Providers (CRUD bilingual) |
| 5 | Booking flow + statuses (Pending/Confirmed/Completed/Cancelled) + UX fixes (back button on notifications, clear action buttons on booking detail, success toast + redirect after booking) |
| 6 | Notifications (DB rows + Expo Push tokens + delivery) |
| 7 | Support tickets + About-app content + admin panel |
| 8 | Cross-platform polish: Android service icons, web RTL final pass, Windows compat, full QA |

**Why phased:** Whole rebuild is multi-week; each phase needs owner verification before moving on. Skipping verification risks compounding bugs.

**How to apply:** When starting a session, check what phase is in-progress — don't jump phases. After completing a phase, ask owner to test the flow end-to-end before opening next phase. Keep this file updated with phase status as work proceeds.

**Status:**
- 2026-04-26: Phases 1+2 complete (auth flow). Owner disabled "Confirm email" in Supabase as workaround for Gmail SMTP blocking signup 500.
- 2026-04-26: Phase 3 (i18n) implemented for critical user-facing screens — login, signup, otp, profile-setup, profile, tabs (_layout + index + bookings + notifications). Language picker on profile.tsx. Web RTL flips dynamically via `document.dir`. Native requires app reload after language change (alerted to user). Phase 5 quick wins folded in: back button on notifications + coming-soon modals for Support/About/Language. Provider-zone, booking flows, booking-form, admin still use STRINGS (AR-only) — to be migrated in their respective phases.
