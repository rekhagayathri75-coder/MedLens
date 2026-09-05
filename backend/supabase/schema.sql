create table if not exists public.medlens_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  record jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.medlens_records enable row level security;

create policy "Users can read their own MedLens record"
  on public.medlens_records for select
  using (auth.uid() = user_id);

create policy "Users can create their own MedLens record"
  on public.medlens_records for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own MedLens record"
  on public.medlens_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own MedLens record"
  on public.medlens_records for delete
  using (auth.uid() = user_id);
