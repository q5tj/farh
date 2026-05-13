-- ============================================================
-- migration_v22: IBAN document upload (proof-of-account)
--
-- The provider's IBAN must match the business name on the commercial
-- registration. v21 collects only the typed IBAN string, which the
-- admin can't independently verify. This migration adds a path column
-- for an uploaded IBAN certificate / bank-letter screenshot so the
-- verification flow can check the name on the document matches the
-- CR before flipping verification_status to 'approved'.
-- ============================================================

begin;

alter table public.providers
  add column if not exists iban_document_path text;

comment on column public.providers.iban_document_path is
  'Storage path of the uploaded IBAN certificate / bank letter — '
  'used by admin during verification to confirm the IBAN belongs to '
  'the same business name on the commercial registration.';

commit;
