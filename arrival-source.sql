-- Apply after customer-fields.sql, BEFORE deploying the updated frontend.
-- Existing rows and older clients remain compatible. Blank sources are NULL.
begin;
alter table public.madar_records add column if not exists arrival_source text
  check(arrival_source is null or char_length(arrival_source) between 1 and 120);

create or replace function public.madar_team_day(p_day date,p_access_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.madar_link_allowed(p_access_token),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_day is null then raise exception 'INVALID_DATE'; end if;
  return jsonb_build_object('today',(now() at time zone 'Asia/Riyadh')::date,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'service',r.service,'city',r.city,
      'nationality',r.nationality,'vehicle_type',r.vehicle_type,'arrival_source',r.arrival_source,'date',r.day,
      'time',to_char(r.created_at at time zone 'Asia/Riyadh','HH24:MI:SS')) order by r.created_at,r.id)
      from public.madar_records r where r.day=p_day),'[]'::jsonb));
end; $$;

create or replace function public.madar_team_add_v3(p_id uuid,p_service text,p_city text,p_nationality text,p_vehicle_type text,p_arrival_source text,p_access_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  service_text text:=btrim(regexp_replace(p_service,'\s+',' ','g'));
  city_text text:=btrim(regexp_replace(p_city,'\s+',' ','g'));
  nationality_text text:=btrim(regexp_replace(p_nationality,'\s+',' ','g'));
  vehicle_text text:=btrim(regexp_replace(p_vehicle_type,'\s+',' ','g'));
  arrival_text text:=nullif(btrim(regexp_replace(p_arrival_source,'\s+',' ','g')),'');
  saved public.madar_records;
begin
  if not coalesce(public.madar_link_allowed(p_access_token),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_id is null or service_text is null or city_text is null or nationality_text is null or vehicle_text is null
     or char_length(service_text) not between 1 and 120 or char_length(city_text) not between 1 and 60
     or char_length(nationality_text) not between 1 and 60 or char_length(vehicle_text) not between 1 and 100
     or (arrival_text is not null and char_length(arrival_text)>120)
  then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  city_text:=case city_text when 'جده' then 'جدة' when 'مكة' then 'مكة المكرمة' when 'مكه' then 'مكة المكرمة'
    when 'مكه المكرمه' then 'مكة المكرمة' when 'المدينة' then 'المدينة المنورة' when 'المدينه' then 'المدينة المنورة'
    when 'المدينه المنوره' then 'المدينة المنورة' when 'ابها' then 'أبها' when 'الاحساء' then 'الأحساء' else city_text end;
  insert into public.madar_records(id,service,city,nationality,vehicle_type,arrival_source)
    values(p_id,service_text,city_text,nationality_text,vehicle_text,arrival_text) on conflict(id) do nothing;
  select * into saved from public.madar_records where id=p_id;
  if saved.service is distinct from service_text or saved.city is distinct from city_text
    or saved.nationality is distinct from nationality_text or saved.vehicle_type is distinct from vehicle_text
    or saved.arrival_source is distinct from arrival_text
  then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
  return jsonb_build_object('id',saved.id,'date',saved.day,'time',to_char(saved.created_at at time zone 'Asia/Riyadh','HH24:MI:SS'));
end; $$;
revoke all on function public.madar_team_add_v3(uuid,text,text,text,text,text,text) from public;
grant execute on function public.madar_team_add_v3(uuid,text,text,text,text,text,text) to anon,authenticated;
commit;
