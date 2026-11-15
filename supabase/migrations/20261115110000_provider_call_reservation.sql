-- Provider call reservation (PR #15 review, items 1 and 4; ADR-0003 D8, ADR-0004 D5).
--
-- Every HTTP attempt to a provider, retries included, first reserves one call:
-- reserve_provider_call() counts today's calls under a per-user, per-provider
-- lock and inserts a 'reserved' row only while the cap has room. Two requests
-- racing for the last call therefore get one reservation between them, and a
-- failed insert means no call is sent. After the attempt the row is settled to
-- success / failure / quota_exceeded; a row left 'reserved' still counts.
--
-- retry_at: a provider's own "try again after" time (Trefle 429 Retry-After).
-- Until then only that provider is skipped.

alter table public.api_usage_logs drop constraint api_usage_logs_status_check;
alter table public.api_usage_logs add constraint api_usage_logs_status_check
  check (status in ('reserved', 'success', 'failure', 'quota_exceeded'));

alter table public.api_usage_logs add column retry_at timestamptz;

create or replace function public.reserve_provider_call(
  p_provider text,
  p_operation text,
  p_since timestamptz,
  p_limit integer
)
returns table (reservation_id uuid, blocked text, retry_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_retry timestamptz;
  v_count integer;
  v_id uuid;
begin
  -- Serializes reservations of one user for one provider until this
  -- transaction ends, so the count below always includes a racing insert.
  perform pg_advisory_xact_lock(
    hashtextextended('api_usage_logs:' || coalesce((select auth.uid())::text, '') || ':' || p_provider, 0)
  );

  select max(l.retry_at) into v_retry
  from public.api_usage_logs l
  where l.provider = p_provider and l.retry_at > now();
  if v_retry is not null then
    return query select null::uuid, 'cooldown'::text, v_retry;
    return;
  end if;

  if exists (
    select 1 from public.api_usage_logs l
    where l.provider = p_provider and l.called_at >= p_since and l.status = 'quota_exceeded'
  ) then
    return query select null::uuid, 'quota'::text, null::timestamptz;
    return;
  end if;

  select count(*) into v_count
  from public.api_usage_logs l
  where l.provider = p_provider and l.called_at >= p_since;
  if v_count >= greatest(coalesce(p_limit, 0), 0) then
    return query select null::uuid, 'limit'::text, null::timestamptz;
    return;
  end if;

  insert into public.api_usage_logs (provider, operation, status)
  values (p_provider, p_operation, 'reserved')
  returning id into v_id;
  return query select v_id, null::text, null::timestamptz;
end;
$$;

revoke all on function public.reserve_provider_call(text, text, timestamptz, integer) from public, anon;
grant execute on function public.reserve_provider_call(text, text, timestamptz, integer) to authenticated;
