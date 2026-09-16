-- Apply after database.sql. Use a private link instead of employee accounts.
begin;
create table if not exists public.madar_link_keys (
  token_hash text primary key check(length(token_hash)=64),
  active boolean not null default true
);
alter table public.madar_link_keys enable row level security;
revoke all on public.madar_link_keys,public.madar_records,public.madar_members from anon,authenticated;
alter table public.madar_records alter column created_by drop not null;
revoke all on function public.madar_get_day(date),public.madar_add_record(uuid,text,text) from authenticated,anon,public;
create or replace function public.madar_link_allowed(p_access_token text)
returns boolean language sql stable security definer set search_path='' as $$
  select length(p_access_token)=64 and exists(select 1 from public.madar_link_keys
  where active and token_hash=encode(sha256(convert_to(p_access_token,'UTF8')),'hex'));
$$;
revoke all on function public.madar_link_allowed(text) from public,anon,authenticated;
create or replace function public.madar_team_day(p_day date,p_access_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.madar_link_allowed(p_access_token),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_day is null then raise exception 'INVALID_DATE'; end if;
  return jsonb_build_object('today',(now() at time zone 'Asia/Riyadh')::date,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'service',r.service,'city',r.city,'date',r.day,
      'time',to_char(r.created_at at time zone 'Asia/Riyadh','HH24:MI:SS')) order by r.created_at,r.id)
      from public.madar_records r where r.day=p_day),'[]'::jsonb));
end; $$;
create or replace function public.madar_team_add(p_id uuid,p_service text,p_city text,p_access_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  service_text text:=btrim(regexp_replace(p_service,'\s+',' ','g'));
  city_text text:=btrim(regexp_replace(p_city,'\s+',' ','g'));
  saved public.madar_records;
begin
  if not coalesce(public.madar_link_allowed(p_access_token),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_id is null or service_text is null or city_text is null or char_length(service_text) not between 1 and 120 or char_length(city_text) not between 1 and 60
  then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  city_text:=case city_text when 'جده' then 'جدة' when 'مكة' then 'مكة المكرمة' when 'مكه' then 'مكة المكرمة'
    when 'مكه المكرمه' then 'مكة المكرمة' when 'المدينة' then 'المدينة المنورة' when 'المدينه' then 'المدينة المنورة'
    when 'المدينه المنوره' then 'المدينة المنورة' when 'ابها' then 'أبها' when 'الاحساء' then 'الأحساء' else city_text end;
  insert into public.madar_records(id,service,city) values(p_id,service_text,city_text) on conflict(id) do nothing;
  select * into saved from public.madar_records where id=p_id;
  if saved.service<>service_text or saved.city<>city_text then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
  return jsonb_build_object('id',saved.id,'date',saved.day,'time',to_char(saved.created_at at time zone 'Asia/Riyadh','HH24:MI:SS'));
end; $$;
revoke all on function public.madar_team_day(date,text),public.madar_team_add(uuid,text,text,text) from public;
grant execute on function public.madar_team_day(date,text),public.madar_team_add(uuid,text,text,text) to anon,authenticated;
commit;

-- Provision the SHA-256 hash of a cryptographically random 32-byte access token privately.
-- Never commit the original token. It belongs only in the employees' URL fragment.
