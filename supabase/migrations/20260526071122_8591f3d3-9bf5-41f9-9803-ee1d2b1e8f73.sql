
create table public.farmers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text not null,
  taluka text not null,
  village text not null,
  gat_number text not null,
  latitude float not null,
  longitude float not null,
  farm_area_acres float not null,
  ndvi_score float,
  co2_tonnes float,
  token_status text not null default 'pending',
  polygonscan_hash text,
  token_amount float,
  created_at timestamptz not null default now()
);

create table public.carbon_tokens (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid references public.farmers(id) on delete cascade,
  farmer_name text,
  village text,
  taluka text,
  token_amount float,
  co2_tonnes float,
  ndvi_score float,
  farm_gps_lat float,
  farm_gps_lon float,
  farm_area_acres float,
  polygonscan_hash text,
  status text not null default 'available',
  price_inr float,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  token_id uuid references public.carbon_tokens(id) on delete set null,
  farmer_id uuid references public.farmers(id) on delete set null,
  buyer_name text,
  buyer_company text,
  buyer_email text,
  amount_paid float,
  farmer_payout float,
  platform_fee float,
  decentro_payment_ref text,
  burn_hash text,
  certificate_id text,
  status text not null default 'pending',
  purchased_at timestamptz not null default now()
);

alter table public.farmers enable row level security;
alter table public.carbon_tokens enable row level security;
alter table public.purchases enable row level security;

-- Public read/write policies (hackathon demo, no auth)
create policy "public read farmers" on public.farmers for select using (true);
create policy "public insert farmers" on public.farmers for insert with check (true);
create policy "public update farmers" on public.farmers for update using (true) with check (true);

create policy "public read tokens" on public.carbon_tokens for select using (true);
create policy "public insert tokens" on public.carbon_tokens for insert with check (true);
create policy "public update tokens" on public.carbon_tokens for update using (true) with check (true);

create policy "public read purchases" on public.purchases for select using (true);
create policy "public insert purchases" on public.purchases for insert with check (true);
create policy "public update purchases" on public.purchases for update using (true) with check (true);

-- Enable realtime for live admin dashboard
alter publication supabase_realtime add table public.farmers;
alter publication supabase_realtime add table public.carbon_tokens;
