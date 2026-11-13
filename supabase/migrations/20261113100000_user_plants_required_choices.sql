-- S05: every choice on the registration form is required (user decision,
-- 2026-11-13). Text fields (nickname, location, memo) stay optional.
-- "Don't know" answers are stored as 'unknown' where the confirmed list has one;
-- pot material has no such option, so the user picks one of the five.
alter table public.user_plants
  alter column environment set not null,
  alter column initial_last_watered_range set not null,
  alter column light_level set not null,
  alter column initial_last_repotted_range set not null,
  alter column pot_material set not null;
