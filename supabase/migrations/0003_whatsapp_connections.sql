create table whatsapp_connections (
  salon_id uuid primary key references salons(id) on delete cascade,
  instance_name text not null,
  status text not null default 'close' check (status in ('close', 'connecting', 'open')),
  updated_at timestamptz not null default now()
);

alter table whatsapp_connections enable row level security;

create policy "whatsapp_connections: acesso ao próprio salão" on whatsapp_connections
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());
