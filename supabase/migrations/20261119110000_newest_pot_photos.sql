-- Newest pot photo per pot, in the database (PR #20 review P2).
--
-- S06 and the S11 list show only each pot's newest photo. Reading every photo
-- and keeping the first per pot in the app would send more rows as photos pile
-- up. This returns one row per pot, using plant_photos_plant_newest_idx.
-- Runs as the caller, so RLS still limits it to the user's own photos.

create or replace function public.newest_pot_photos(p_plant_ids uuid[])
returns table (id uuid, plant_id uuid, storage_path text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (photo.plant_id) photo.id, photo.plant_id, photo.storage_path, photo.created_at
    from public.plant_photos as photo
   where photo.photo_type = 'plant'
     and photo.plant_id = any (p_plant_ids)
   order by photo.plant_id, photo.created_at desc, photo.id desc;
$$;

revoke all on function public.newest_pot_photos(uuid[]) from public, anon;
grant execute on function public.newest_pot_photos(uuid[]) to authenticated;
