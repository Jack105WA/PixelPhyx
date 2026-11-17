-- PixelPhyx Supabase Realtime Database compatibility layer.
-- Before testing, enable Authentication > Sign In / Providers > Anonymous.
-- Then run this file once in the Supabase SQL Editor.

create table if not exists public.pixelphyx_nodes (
  path text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pixelphyx_nodes enable row level security;

drop policy if exists "Authenticated users can read PixelPhyx data" on public.pixelphyx_nodes;
drop policy if exists "Authenticated users can write PixelPhyx data" on public.pixelphyx_nodes;

-- Match the old Firebase rules: shared room/lobby data is readable by signed-in
-- guests, while each user's bandwidth report remains private.
create policy "Authenticated users can read PixelPhyx data"
  on public.pixelphyx_nodes for select to authenticated
  using (
    split_part(path, '/', 1) <> 'usageReports'
    or split_part(path, '/', 2) = auth.uid()::text
  );

create policy "Authenticated users can write PixelPhyx data"
  on public.pixelphyx_nodes for all to authenticated
  using (
    path not in ('', 'rooms', 'lobbyDirectory', 'lobbySlots', 'usageReports', 'serviceStatus')
    and split_part(path, '/', 1) <> 'serviceStatus'
    and (
      split_part(path, '/', 1) <> 'usageReports'
      or split_part(path, '/', 2) = auth.uid()::text
    )
  )
  with check (
    path not in ('', 'rooms', 'lobbyDirectory', 'lobbySlots', 'usageReports', 'serviceStatus')
    and split_part(path, '/', 1) <> 'serviceStatus'
    and (
      split_part(path, '/', 1) <> 'usageReports'
      or split_part(path, '/', 2) = auth.uid()::text
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.pixelphyx_nodes;
exception when duplicate_object then null;
end $$;

-- Maintain shared daily/monthly traffic totals without exposing individual reports.
create or replace function public.pixelphyx_adjust_usage(p_path text, p_delta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pixelphyx_nodes(path, value)
  values (p_path, jsonb_build_object('estimatedBytes', greatest(0, p_delta)))
  on conflict (path) do update
    set value = jsonb_set(
      coalesce(public.pixelphyx_nodes.value, '{}'::jsonb),
      '{estimatedBytes}',
      to_jsonb(greatest(0,
        coalesce((public.pixelphyx_nodes.value->>'estimatedBytes')::numeric, 0) + p_delta
      )),
      true
    ),
    updated_at = now();
end;
$$;

create or replace function public.pixelphyx_sync_usage_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_day text;
  old_month text;
  new_day text;
  new_month text;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.path like 'usageReports/%' then
    old_day := old.value->>'day';
    old_month := old.value->>'month';
    if old_day is not null then
      perform public.pixelphyx_adjust_usage(
        'serviceStatus/bandwidth/daily/' || old_day,
        -coalesce((old.value->>'estimatedDailyBytes')::numeric, 0)
      );
    end if;
    if old_month is not null then
      perform public.pixelphyx_adjust_usage(
        'serviceStatus/bandwidth/monthly/' || old_month,
        -coalesce((old.value->>'estimatedMonthlyBytes')::numeric, 0)
      );
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.path like 'usageReports/%' then
    new_day := new.value->>'day';
    new_month := new.value->>'month';
    if new_day is not null then
      perform public.pixelphyx_adjust_usage(
        'serviceStatus/bandwidth/daily/' || new_day,
        coalesce((new.value->>'estimatedDailyBytes')::numeric, 0)
      );
    end if;
    if new_month is not null then
      perform public.pixelphyx_adjust_usage(
        'serviceStatus/bandwidth/monthly/' || new_month,
        coalesce((new.value->>'estimatedMonthlyBytes')::numeric, 0)
      );
    end if;
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists pixelphyx_usage_report_sync on public.pixelphyx_nodes;
create trigger pixelphyx_usage_report_sync
after insert or update or delete on public.pixelphyx_nodes
for each row
execute function public.pixelphyx_sync_usage_report();

create or replace function public.pixelphyx_compare_and_set(
  p_path text, p_expected jsonb, p_next jsonb, p_exists boolean
) returns boolean
language plpgsql security invoker set search_path = public
as $$
declare changed integer;
begin
  if p_exists then
    update public.pixelphyx_nodes
       set value = p_next, updated_at = now()
     where path = p_path and value is not distinct from p_expected;
    get diagnostics changed = row_count;
    return changed = 1;
  else
    insert into public.pixelphyx_nodes(path, value)
    values (p_path, p_next)
    on conflict (path) do nothing;
    get diagnostics changed = row_count;
    return changed = 1;
  end if;
end;
$$;

create or replace function public.pixelphyx_broadcast_node_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $
declare
  row_path text;
  parts text[];
  next_value jsonb;
  old_value jsonb;
  i integer;
begin
  row_path := case when tg_op = 'DELETE' then old.path else new.path end;

  -- Usage reports contain per-user data; only their aggregate rows are broadcast.
  if split_part(row_path, '/', 1) = 'usageReports' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  parts := string_to_array(row_path, '/');
  next_value := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_value := case when tg_op = 'INSERT' then null else to_jsonb(old) end;

  for i in 1..array_length(parts, 1) loop
    perform realtime.send(
      jsonb_build_object('path', row_path, 'operation', tg_op, 'new', next_value, 'old', old_value),
      'db_change',
      'pixelphyx:' || array_to_string(parts[1:i], '/'),
      true
    );
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$;

drop trigger if exists pixelphyx_broadcast_node_change on public.pixelphyx_nodes;
create trigger pixelphyx_broadcast_node_change
after insert or update or delete on public.pixelphyx_nodes
for each row execute function public.pixelphyx_broadcast_node_change();

drop policy if exists "Authenticated users can receive PixelPhyx broadcasts" on realtime.messages;
create policy "Authenticated users can receive PixelPhyx broadcasts"
  on realtime.messages for select to authenticated
  using (realtime.topic() like 'pixelphyx:%' and extension = 'broadcast');

revoke all on function public.pixelphyx_adjust_usage(text, numeric) from public, anon, authenticated;
revoke all on function public.pixelphyx_sync_usage_report() from public, anon, authenticated;
revoke all on function public.pixelphyx_broadcast_node_change() from public, anon, authenticated;
revoke all on function public.pixelphyx_compare_and_set(text, jsonb, jsonb, boolean) from public, anon, authenticated;

grant select, insert, update, delete on public.pixelphyx_nodes to authenticated;
grant execute on function public.pixelphyx_compare_and_set(text, jsonb, jsonb, boolean) to authenticated;
