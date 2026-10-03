-- Finance Tracker: run this ONCE if you already ran the original schema.sql.
-- The first version limited the "skin" column to a fixed list of themes, which
-- would reject the new Coquette theme. This replaces that list with a length check
-- (the app itself validates theme names), so future themes need no database change.

alter table public.settings drop constraint if exists settings_skin_check;
alter table public.settings
  add constraint settings_skin_check check (char_length(skin) between 1 and 20);
