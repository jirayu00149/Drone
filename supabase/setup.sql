begin;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_role_check
    check (role in ('admin', 'operator', 'drone_pilot', 'viewer'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create or replace function public.is_rescue_staff()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles
    where user_id = (select auth.uid())
      and active
      and role in ('admin', 'operator', 'drone_pilot', 'viewer')
  );
$$;

create or replace function public.can_manage_rescue_data()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles
    where user_id = (select auth.uid())
      and active
      and role in ('admin', 'operator', 'drone_pilot')
  );
$$;

revoke all on function public.is_rescue_staff() from public;
revoke all on function public.can_manage_rescue_data() from public;
grant execute on function public.is_rescue_staff() to authenticated;
grant execute on function public.can_manage_rescue_data() to authenticated;

create table if not exists public.missing_persons (
  id bigint generated always as identity primary key,
  case_code text not null unique,
  full_name text not null,
  age smallint,
  priority text not null default 'medium',
  status text not null default 'searching',
  last_seen_text text,
  last_seen_latitude numeric(9,6),
  last_seen_longitude numeric(9,6),
  reporter_contact text,
  note text,
  initials text,
  reference_photo_path text,
  reference_photo_hash text,
  face_embedding jsonb,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  found_at timestamptz,
  found_latitude numeric(9,6),
  found_longitude numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint missing_persons_case_code_not_blank check (length(trim(case_code)) > 0),
  constraint missing_persons_full_name_not_blank check (length(trim(full_name)) > 0),
  constraint missing_persons_age_check check (age is null or age between 0 and 130),
  constraint missing_persons_priority_check check (priority in ('low', 'medium', 'high')),
  constraint missing_persons_status_check check (status in ('searching', 'review', 'found', 'closed')),
  constraint missing_persons_last_seen_latitude_check check (last_seen_latitude is null or last_seen_latitude between -90 and 90),
  constraint missing_persons_last_seen_longitude_check check (last_seen_longitude is null or last_seen_longitude between -180 and 180),
  constraint missing_persons_found_latitude_check check (found_latitude is null or found_latitude between -90 and 90),
  constraint missing_persons_found_longitude_check check (found_longitude is null or found_longitude between -180 and 180),
  constraint missing_persons_face_embedding_check check (face_embedding is null or jsonb_typeof(face_embedding) = 'array')
);

create table if not exists public.missing_person_reports (
  id bigint generated always as identity primary key,
  report_code text not null unique,
  full_name text not null,
  age smallint,
  priority text not null default 'medium',
  last_seen_text text,
  reporter_contact text not null,
  note text,
  reference_photo_path text,
  face_embedding jsonb,
  status text not null default 'new',
  created_case_id bigint references public.missing_persons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint missing_person_reports_report_code_not_blank check (length(trim(report_code)) > 0),
  constraint missing_person_reports_full_name_not_blank check (length(trim(full_name)) > 0),
  constraint missing_person_reports_contact_not_blank check (length(trim(reporter_contact)) > 0),
  constraint missing_person_reports_age_check check (age is null or age between 0 and 130),
  constraint missing_person_reports_priority_check check (priority in ('low', 'medium', 'high')),
  constraint missing_person_reports_status_check check (status in ('new', 'triaged', 'accepted', 'rejected')),
  constraint missing_person_reports_face_embedding_check check (face_embedding is null or jsonb_typeof(face_embedding) = 'array')
);

create table if not exists public.rescue_logs (
  id bigint generated always as identity primary key,
  missing_person_id bigint not null references public.missing_persons(id) on delete cascade,
  event_type text not null,
  confidence smallint,
  latitude numeric(9,6),
  longitude numeric(9,6),
  source text not null default 'operator',
  message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rescue_logs_event_type_check check (event_type in ('candidate', 'found', 'status_change', 'note', 'command')),
  constraint rescue_logs_confidence_check check (confidence is null or confidence between 0 and 100),
  constraint rescue_logs_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint rescue_logs_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint rescue_logs_source_check check (source in ('drone', 'operator', 'system', 'public'))
);

create table if not exists public.match_candidates (
  id bigint generated always as identity primary key,
  missing_person_id bigint not null references public.missing_persons(id) on delete cascade,
  rescue_log_id bigint references public.rescue_logs(id) on delete set null,
  confidence smallint not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  capture_photo_path text,
  status text not null default 'review',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_candidates_confidence_check check (confidence between 0 and 100),
  constraint match_candidates_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint match_candidates_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint match_candidates_status_check check (status in ('review', 'confirmed', 'rejected'))
);

create table if not exists public.drone_commands (
  id bigint generated always as identity primary key,
  command text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint drone_commands_command_not_blank check (length(trim(command)) > 0),
  constraint drone_commands_status_check check (status in ('queued', 'sent', 'acknowledged', 'failed', 'completed')),
  constraint drone_commands_payload_object_check check (jsonb_typeof(payload) = 'object')
);

drop trigger if exists set_staff_profiles_updated_at on public.staff_profiles;
create trigger set_staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_missing_persons_updated_at on public.missing_persons;
create trigger set_missing_persons_updated_at
before update on public.missing_persons
for each row execute function public.set_updated_at();

drop trigger if exists set_missing_person_reports_updated_at on public.missing_person_reports;
create trigger set_missing_person_reports_updated_at
before update on public.missing_person_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_match_candidates_updated_at on public.match_candidates;
create trigger set_match_candidates_updated_at
before update on public.match_candidates
for each row execute function public.set_updated_at();

drop trigger if exists set_drone_commands_updated_at on public.drone_commands;
create trigger set_drone_commands_updated_at
before update on public.drone_commands
for each row execute function public.set_updated_at();

create index if not exists staff_profiles_active_role_idx
on public.staff_profiles (active, role);

create index if not exists missing_persons_status_priority_created_at_idx
on public.missing_persons (status, priority, created_at desc);

create index if not exists missing_persons_active_search_idx
on public.missing_persons (priority, created_at desc)
where status in ('searching', 'review');

create index if not exists missing_persons_found_at_idx
on public.missing_persons (found_at desc)
where status = 'found';

create index if not exists missing_persons_created_by_idx
on public.missing_persons (created_by);

create index if not exists missing_persons_reviewed_by_idx
on public.missing_persons (reviewed_by);

create index if not exists missing_person_reports_status_created_at_idx
on public.missing_person_reports (status, created_at desc);

create index if not exists missing_person_reports_created_case_id_idx
on public.missing_person_reports (created_case_id);

create index if not exists rescue_logs_missing_person_created_at_idx
on public.rescue_logs (missing_person_id, created_at desc);

create index if not exists rescue_logs_event_created_at_idx
on public.rescue_logs (event_type, created_at desc);

create index if not exists rescue_logs_created_by_idx
on public.rescue_logs (created_by);

create index if not exists match_candidates_missing_person_status_idx
on public.match_candidates (missing_person_id, status, created_at desc);

create index if not exists match_candidates_rescue_log_id_idx
on public.match_candidates (rescue_log_id);

create index if not exists match_candidates_reviewed_by_idx
on public.match_candidates (reviewed_by);

create index if not exists drone_commands_status_issued_at_idx
on public.drone_commands (status, issued_at desc);

create index if not exists drone_commands_issued_by_idx
on public.drone_commands (issued_by);

alter table public.staff_profiles enable row level security;
alter table public.missing_persons enable row level security;
alter table public.missing_person_reports enable row level security;
alter table public.rescue_logs enable row level security;
alter table public.match_candidates enable row level security;
alter table public.drone_commands enable row level security;

grant usage on schema public to anon, authenticated;

grant select on public.staff_profiles to authenticated;

grant select (
  case_code,
  full_name,
  age,
  priority,
  last_seen_text,
  note,
  initials,
  status,
  found_at,
  found_latitude,
  found_longitude,
  created_at,
  updated_at
) on public.missing_persons to anon;

grant insert (
  report_code,
  full_name,
  age,
  priority,
  last_seen_text,
  reporter_contact,
  note
) on public.missing_person_reports to anon;

grant select (
  missing_person_id,
  event_type,
  confidence,
  latitude,
  longitude,
  source,
  message,
  created_at
) on public.rescue_logs to anon;

grant select on
  public.missing_persons,
  public.missing_person_reports,
  public.rescue_logs,
  public.match_candidates,
  public.drone_commands
to authenticated;

grant insert, update on
  public.missing_persons,
  public.missing_person_reports,
  public.rescue_logs,
  public.match_candidates,
  public.drone_commands
to authenticated;

grant usage, select on sequence public.missing_person_reports_id_seq to anon;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists staff_profiles_select_own on public.staff_profiles;
create policy staff_profiles_select_own
on public.staff_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists missing_persons_public_select on public.missing_persons;
create policy missing_persons_public_select
on public.missing_persons
for select
to anon
using (status in ('searching', 'review', 'found'));

drop policy if exists missing_persons_staff_select on public.missing_persons;
create policy missing_persons_staff_select
on public.missing_persons
for select
to authenticated
using ((select public.is_rescue_staff()));

drop policy if exists missing_persons_staff_insert on public.missing_persons;
create policy missing_persons_staff_insert
on public.missing_persons
for insert
to authenticated
with check ((select public.can_manage_rescue_data()));

drop policy if exists missing_persons_staff_update on public.missing_persons;
create policy missing_persons_staff_update
on public.missing_persons
for update
to authenticated
using ((select public.can_manage_rescue_data()))
with check ((select public.can_manage_rescue_data()));

drop policy if exists missing_person_reports_public_insert on public.missing_person_reports;
create policy missing_person_reports_public_insert
on public.missing_person_reports
for insert
to anon
with check (status = 'new' and created_case_id is null);

drop policy if exists missing_person_reports_staff_select on public.missing_person_reports;
create policy missing_person_reports_staff_select
on public.missing_person_reports
for select
to authenticated
using ((select public.is_rescue_staff()));

drop policy if exists missing_person_reports_staff_insert on public.missing_person_reports;
create policy missing_person_reports_staff_insert
on public.missing_person_reports
for insert
to authenticated
with check ((select public.can_manage_rescue_data()));

drop policy if exists missing_person_reports_staff_update on public.missing_person_reports;
create policy missing_person_reports_staff_update
on public.missing_person_reports
for update
to authenticated
using ((select public.can_manage_rescue_data()))
with check ((select public.can_manage_rescue_data()));

drop policy if exists rescue_logs_public_found_select on public.rescue_logs;
create policy rescue_logs_public_found_select
on public.rescue_logs
for select
to anon
using (event_type = 'found');

drop policy if exists rescue_logs_staff_select on public.rescue_logs;
create policy rescue_logs_staff_select
on public.rescue_logs
for select
to authenticated
using ((select public.is_rescue_staff()));

drop policy if exists rescue_logs_staff_insert on public.rescue_logs;
create policy rescue_logs_staff_insert
on public.rescue_logs
for insert
to authenticated
with check ((select public.can_manage_rescue_data()));

drop policy if exists rescue_logs_staff_update on public.rescue_logs;
create policy rescue_logs_staff_update
on public.rescue_logs
for update
to authenticated
using ((select public.can_manage_rescue_data()))
with check ((select public.can_manage_rescue_data()));

drop policy if exists match_candidates_staff_select on public.match_candidates;
create policy match_candidates_staff_select
on public.match_candidates
for select
to authenticated
using ((select public.is_rescue_staff()));

drop policy if exists match_candidates_staff_insert on public.match_candidates;
create policy match_candidates_staff_insert
on public.match_candidates
for insert
to authenticated
with check ((select public.can_manage_rescue_data()));

drop policy if exists match_candidates_staff_update on public.match_candidates;
create policy match_candidates_staff_update
on public.match_candidates
for update
to authenticated
using ((select public.can_manage_rescue_data()))
with check ((select public.can_manage_rescue_data()));

drop policy if exists drone_commands_staff_select on public.drone_commands;
create policy drone_commands_staff_select
on public.drone_commands
for select
to authenticated
using ((select public.is_rescue_staff()));

drop policy if exists drone_commands_staff_insert on public.drone_commands;
create policy drone_commands_staff_insert
on public.drone_commands
for insert
to authenticated
with check ((select public.can_manage_rescue_data()));

drop policy if exists drone_commands_staff_update on public.drone_commands;
create policy drone_commands_staff_update
on public.drone_commands
for update
to authenticated
using ((select public.can_manage_rescue_data()))
with check ((select public.can_manage_rescue_data()));

insert into storage.buckets (id, name, public)
values
  ('missing-person-references', 'missing-person-references', false),
  ('drone-captures', 'drone-captures', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists storage_rescue_staff_select on storage.objects;
create policy storage_rescue_staff_select
on storage.objects
for select
to authenticated
using (
  bucket_id in ('missing-person-references', 'drone-captures')
  and (select public.is_rescue_staff())
);

drop policy if exists storage_rescue_staff_insert on storage.objects;
create policy storage_rescue_staff_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('missing-person-references', 'drone-captures')
  and (select public.can_manage_rescue_data())
);

drop policy if exists storage_rescue_staff_update on storage.objects;
create policy storage_rescue_staff_update
on storage.objects
for update
to authenticated
using (
  bucket_id in ('missing-person-references', 'drone-captures')
  and (select public.can_manage_rescue_data())
)
with check (
  bucket_id in ('missing-person-references', 'drone-captures')
  and (select public.can_manage_rescue_data())
);

drop policy if exists storage_rescue_staff_delete on storage.objects;
create policy storage_rescue_staff_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('missing-person-references', 'drone-captures')
  and (select public.can_manage_rescue_data())
);

commit;
