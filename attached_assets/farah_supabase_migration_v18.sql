-- ============================================================
-- migration_v18: bilingual category names (English backfill)
--
-- The `categories` table already has `name_en` (added in v2) but it
-- was never populated for the seed rows, so customers viewing the app
-- in English saw the Arabic names verbatim. This migration fills in
-- English translations for the seeded categories by `slug` so they
-- survive renames.
--
-- For categories admins added later that don't match a known slug, we
-- fall back to copying name_ar — the admin can edit name_en from the
-- categories screen afterwards.
-- ============================================================

begin;

-- Backfill known seed categories (matched on slug, which is stable).
update public.categories set name_en = 'Poets' where slug = 'poets' and (name_en is null or name_en = '');
update public.categories set name_en = 'Ardha Poets' where slug = 'ardha-poets' and (name_en is null or name_en = '');
update public.categories set name_en = 'Munshideen' where slug = 'munshideen' and (name_en is null or name_en = '');
update public.categories set name_en = 'Dama & Shilat Bands' where slug = 'dama-shilat' and (name_en is null or name_en = '');
update public.categories set name_en = 'Drums & Lines' where slug = 'drums' and (name_en is null or name_en = '');
update public.categories set name_en = 'Qahwaji (Coffee Servers)' where slug = 'qahwaji' and (name_en is null or name_en = '');
update public.categories set name_en = 'Sound Systems' where slug = 'audio' and (name_en is null or name_en = '');
update public.categories set name_en = 'Photography' where slug = 'photo' and (name_en is null or name_en = '');
update public.categories set name_en = 'Videography' where slug = 'video' and (name_en is null or name_en = '');
update public.categories set name_en = 'Female Photographers' where slug = 'female-photo' and (name_en is null or name_en = '');
update public.categories set name_en = 'Wedding Halls & Palaces' where slug = 'halls' and (name_en is null or name_en = '');
update public.categories set name_en = 'Restaurants' where slug = 'restaurants' and (name_en is null or name_en = '');
update public.categories set name_en = 'Cafes' where slug = 'cafes' and (name_en is null or name_en = '');
update public.categories set name_en = 'Traditional Food' where slug = 'popular-food' and (name_en is null or name_en = '');
update public.categories set name_en = 'Florists' where slug = 'flowers' and (name_en is null or name_en = '');
update public.categories set name_en = 'Sweets Shops' where slug = 'sweets' and (name_en is null or name_en = '');
update public.categories set name_en = 'Wedding Prep & Entrances' where slug = 'wedding-prep' and (name_en is null or name_en = '');
update public.categories set name_en = 'Furniture & Supplies' where slug = 'furniture' and (name_en is null or name_en = '');
update public.categories set name_en = 'Women Section' where slug = 'women-section' and (name_en is null or name_en = '');
update public.categories set name_en = 'Event Organizers' where slug = 'organizers' and (name_en is null or name_en = '');

-- Fallback for any other category that's still missing an English name —
-- copy the Arabic so the column is never blank (admin can edit later).
update public.categories
  set name_en = coalesce(name_ar, name)
  where name_en is null or name_en = '';

commit;
