-- Single round-trip dashboard counts; no rows transferred to client.
create or replace function public.get_dashboard_stats()
returns table (
  total bigint,
  new_count bigint,
  contacted_count bigint,
  responded_count bigint,
  meeting_count bigint,
  closed_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)                                                                as total,
    count(*) filter (where pipeline_stage = 'new')        as new_count,
    count(*) filter (where pipeline_stage = 'contacted')  as contacted_count,
    count(*) filter (where pipeline_stage = 'responded')  as responded_count,
    count(*) filter (where pipeline_stage = 'meeting')    as meeting_count,
    count(*) filter (where pipeline_stage = 'closed')     as closed_count
  from public.contacts;
$$;

grant execute on function public.get_dashboard_stats() to authenticated;
