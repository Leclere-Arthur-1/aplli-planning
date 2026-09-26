-- Application de tournées : schéma initial pour un nouveau projet Supabase.
-- À exécuter une seule fois dans SQL Editor, sur le NOUVEAU projet.
-- Les identifiants utilisateurs proviennent de Supabase Auth.

create extension if not exists pgcrypto;

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  home_address text,
  home_postal_code text,
  home_city text,
  home_country text not null default 'France',
  home_latitude double precision check (home_latitude between -90 and 90),
  home_longitude double precision check (home_longitude between -180 and 180),
  target_client_minutes integer not null default 540 check (target_client_minutes between 1 and 1440),
  working_days integer[] not null default array[1,2,3,4,5],
  day_start time not null default '08:00',
  day_end time not null default '20:00',
  max_travel_minutes integer check (max_travel_minutes is null or max_travel_minutes >= 0),
  constraint settings_hours check (day_end > day_start),
  constraint settings_days check (working_days <@ array[1,2,3,4,5,6,7] and cardinality(working_days) > 0)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  external_id text not null,
  name text not null check (length(trim(name)) > 0),
  street_address text not null,
  postal_code text not null,
  city text not null,
  country text not null default 'France',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  geocode_status text not null default 'pending' check (geocode_status in ('pending','verified','review')),
  visit_minutes integer not null check (visit_minutes between 1 and 1440),
  visits_per_month integer not null check (visits_per_month between 1 and 4),
  active_months integer[] not null,
  allowed_days integer[],
  excluded_days integer[] not null default '{}',
  fixed_start_time time,
  window_start time,
  window_end time,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id),
  unique (user_id, id),
  constraint months_valid check (active_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]),
  constraint days_allowed_valid check (allowed_days is null or allowed_days <@ array[1,2,3,4,5,6,7]),
  constraint days_excluded_valid check (excluded_days <@ array[1,2,3,4,5,6,7]),
  constraint window_valid check ((window_start is null and window_end is null) or (window_start is not null and window_end is not null and window_end > window_start)),
  constraint fixed_in_window check (fixed_start_time is null or window_start is null or (fixed_start_time >= window_start and fixed_start_time < window_end))
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  due_month date not null check (extract(day from due_month) = 1),
  occurrence integer not null check (occurrence between 1 and 4),
  scheduled_date date,
  scheduled_start time,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  route_order integer check (route_order is null or route_order > 0),
  status text not null default 'to_plan' check (status in ('to_plan','planned','done','cancelled','to_reschedule')),
  is_locked boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, client_id) references public.clients(user_id, id) on delete cascade,
  unique (user_id, client_id, due_month, occurrence),
  constraint visit_in_month check (scheduled_date is null or date_trunc('month', scheduled_date::timestamp)::date = due_month),
  constraint planned_has_date check (status not in ('planned','done') or scheduled_date is not null),
  constraint time_has_date check (scheduled_start is null or scheduled_date is not null)
);

create index clients_user_name_idx on public.clients(user_id, name);
create index visits_user_date_idx on public.visits(user_id, scheduled_date);
create index visits_user_month_idx on public.visits(user_id, due_month, status);

-- Toutes les tables accessibles depuis l'application sont privées par utilisateur.
alter table public.user_settings enable row level security;
alter table public.clients enable row level security;
alter table public.visits enable row level security;
revoke all on public.user_settings, public.clients, public.visits from anon, authenticated;
grant select, insert, update, delete on public.user_settings, public.clients, public.visits to authenticated;

create policy settings_select on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy settings_insert on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy settings_update on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy settings_delete on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);

create policy clients_select on public.clients for select to authenticated using ((select auth.uid()) = user_id);
create policy clients_insert on public.clients for insert to authenticated with check ((select auth.uid()) = user_id);
create policy clients_update on public.clients for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy clients_delete on public.clients for delete to authenticated using ((select auth.uid()) = user_id);

create policy visits_select on public.visits for select to authenticated using ((select auth.uid()) = user_id);
create policy visits_insert on public.visits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy visits_update on public.visits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy visits_delete on public.visits for delete to authenticated using ((select auth.uid()) = user_id);

-- Recherche du prochain rendez-vous et carte : requêter clients + visites
-- filtrées par scheduled_date, puis associer client_id côté application.
-- Le programme d'import convertira Oui/Non en active_months et les noms des
-- jours en nombres ISO (lundi=1 ... dimanche=7).
