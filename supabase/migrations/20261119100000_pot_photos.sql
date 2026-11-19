-- Pot photos (S05 and S06 [사진 추가]/[사진 삭제]), ADR-0003 D6 and D18.
--
-- Pot photos are uploaded inside the save request and linked to the pot in the
-- same request (attached_at set on insert). If the row cannot be written, the
-- request removes the uploaded file itself, so no unlinked photo is left
-- behind except when the server stops mid-request (DF-06).
--
-- 1. A pot photo always belongs to a pot.
-- 2. delete_pot_photo() follows D18: one transaction queues the Storage path in
--    storage_deletions and deletes the photo row. The caller then removes the
--    file and marks the queued path done or failed (a later retry job, DF-06,
--    picks up failures).

alter table public.plant_photos
  add constraint plant_photos_plant_needs_pot check (photo_type <> 'plant' or plant_id is not null);

-- Newest photo of a pot first (S06, S11).
create index plant_photos_plant_newest_idx on public.plant_photos (plant_id, created_at desc)
  where photo_type = 'plant';

-- Deletes one own pot photo and queues its file for removal. Returns the queued
-- path and its deletion request id, or no row when the photo does not exist,
-- is not a pot photo of p_plant_id, or belongs to someone else (RLS).
create or replace function public.delete_pot_photo(p_plant_id uuid, p_photo_id uuid)
returns table (storage_path text, deletion_request_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  path text;
  request uuid := gen_random_uuid();
begin
  delete from public.plant_photos as photo
   where photo.id = p_photo_id
     and photo.plant_id = p_plant_id
     and photo.photo_type = 'plant'
  returning photo.storage_path into path;
  if path is null then
    return;
  end if;
  insert into public.storage_deletions (deletion_request_id, storage_path)
  values (request, path);
  storage_path := path;
  deletion_request_id := request;
  return next;
end;
$$;

revoke all on function public.delete_pot_photo(uuid, uuid) from public, anon;
grant execute on function public.delete_pot_photo(uuid, uuid) to authenticated;
