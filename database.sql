-- Run once in the Supabase SQL Editor. This creates no sample records.
begin;
create table if not exists public.madar_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true
);
create table if not exists public.madar_records (
  id uuid primary key,
  service text not null check (char_length(service) between 1 and 120),
  city text not null check (char_length(city) between 1 and 60),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  day date generated always as ((created_at at time zone 'Asia/Riyadh')::date) stored
);
create index if not exists madar_records_day_idx on public.madar_records(day,created_at,id);
alter table public.madar_members enable row level security;
alter table public.madar_records enable row level security;
revoke all on public.madar_members,public.madar_records from anon,authenticated;
grant select on public.madar_members,public.madar_records to authenticated;
drop policy if exists madar_member_self on public.madar_members;
create policy madar_member_self on public.madar_members for select to authenticated
using(user_id=(select auth.uid()));
drop policy if exists madar_team_read on public.madar_records;
create policy madar_team_read on public.madar_records for select to authenticated
using(exists(select 1 from public.madar_members m where m.user_id=(select auth.uid()) and m.active));

create or replace function public.madar_get_day(p_day date)
returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
  if p_day is null then raise exception 'INVALID_DATE'; end if;
  if not exists(select 1 from public.madar_members where user_id=auth.uid() and active)
  then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  return jsonb_build_object(
    'today',(now() at time zone 'Asia/Riyadh')::date,
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'service',r.service,'city',r.city,'date',r.day,
      'time',to_char(r.created_at at time zone 'Asia/Riyadh','HH24:MI:SS')
    ) order by r.created_at,r.id) from public.madar_records r where r.day=p_day),'[]'::jsonb)
  );
end; $$;

create or replace function public.madar_add_record(p_id uuid,p_service text,p_city text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  service_text text:=btrim(regexp_replace(p_service,'\s+',' ','g'));
  city_text text:=btrim(regexp_replace(p_city,'\s+',' ','g'));
  saved public.madar_records;
begin
  if actor is null or not exists(select 1 from public.madar_members where user_id=actor and active)
  then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_id is null or service_text is null or city_text is null
    or char_length(service_text) not between 1 and 120 or char_length(city_text) not between 1 and 60
  then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  city_text:=case city_text when 'جده' then 'جدة' when 'مكة' then 'مكة المكرمة'
    when 'مكه' then 'مكة المكرمة' when 'مكه المكرمه' then 'مكة المكرمة'
    when 'المدينة' then 'المدينة المنورة' when 'المدينه' then 'المدينة المنورة'
    when 'المدينه المنوره' then 'المدينة المنورة' when 'ابها' then 'أبها'
    when 'الاحساء' then 'الأحساء' else city_text end;
  insert into public.madar_records(id,service,city,created_by)
    values(p_id,service_text,city_text,actor) on conflict(id) do nothing;
  select * into saved from public.madar_records where id=p_id and created_by=actor;
  if saved.id is null or saved.service<>service_text or saved.city<>city_text
    then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
  return jsonb_build_object('id',saved.id,'date',saved.day,'time',to_char(saved.created_at at time zone 'Asia/Riyadh','HH24:MI:SS'));
end; $$;
revoke all on function public.madar_get_day(date) from public,anon;
revoke all on function public.madar_add_record(uuid,text,text) from public,anon;
grant execute on function public.madar_get_day(date) to authenticated;
grant execute on function public.madar_add_record(uuid,text,text) to authenticated;
commit;

-- Add each employee through Authentication > Users first, then run with their real UUID:
-- insert into public.madar_members(user_id) values ('EMPLOYEE-USER-UUID')
-- on conflict(user_id) do update set active=true;
-- To revoke an employee: update public.madar_members set active=false where user_id='EMPLOYEE-USER-UUID';
