-- Finance + automation logs evolution for Harmonics App
-- Run in Supabase SQL editor.

create table if not exists public.finance_cost_defaults (
  id bigserial primary key,
  slug text not null unique default 'default',
  musician_unit_cost numeric not null default 0,
  sound_default_cost numeric not null default 0,
  transport_default_cost numeric not null default 0,
  other_default_cost numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.finance_cost_defaults (slug)
values ('default')
on conflict (slug) do nothing;

alter table public.events
  add column if not exists other_cost numeric not null default 0;

alter table public.events
  add column if not exists net_amount numeric;

alter table public.events
  add column if not exists paid_amount numeric not null default 0;

alter table public.events
  add column if not exists open_amount numeric;

alter table public.events
  add column if not exists payment_status text;

alter table public.payments
  add column if not exists source text;

alter table public.payments
  add column if not exists client_name text;

alter table public.payments
  add column if not exists receipt_url text;

alter table public.payments
  add column if not exists notes text;

create index if not exists idx_payments_event_id on public.payments (event_id);
create index if not exists idx_automation_logs_created_at on public.automation_logs (created_at);
create index if not exists idx_automation_logs_status on public.automation_logs (status);
