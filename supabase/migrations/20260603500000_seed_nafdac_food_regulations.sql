-- NOTE: The regulatory library in this platform is in-memory (not a database table).
-- NAFDAC, PCN, and SON regulations are stored in:
--   src/lib/regulatoryLibraryService.ts  (LIBRARY_DATA array)
--
-- This migration is intentionally empty. The data was added directly to the
-- service file in the same commit that created this migration.
--
-- Do NOT create a regulatory_library table here — doing so would diverge from
-- the in-memory architecture used by the rest of the platform.
SELECT 1; -- no-op placeholder so Supabase CLI does not skip the file
