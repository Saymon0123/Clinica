create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  contact_phone text not null,
  contact_name text,
  last_message_at timestamptz,
  needs_human boolean not null default false,
  created_at timestamptz not null default now(),
  unique (salon_id, contact_phone)
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  sender text not null default 'cliente' check (sender in ('cliente', 'agente', 'dono')),
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_whatsapp_conversations_salon on whatsapp_conversations (salon_id, last_message_at desc);
create index idx_whatsapp_messages_conversation on whatsapp_messages (conversation_id, created_at);

create or replace function whatsapp_touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update whatsapp_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger whatsapp_messages_touch_conversation
after insert on whatsapp_messages
for each row execute function whatsapp_touch_conversation();

alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

create policy "whatsapp_conversations: acesso ao próprio salão" on whatsapp_conversations
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "whatsapp_messages: acesso ao próprio salão" on whatsapp_messages
  for all using (conversation_id in (select id from whatsapp_conversations where salon_id = auth_salon_id()))
  with check (conversation_id in (select id from whatsapp_conversations where salon_id = auth_salon_id()));

alter publication supabase_realtime add table whatsapp_conversations, whatsapp_messages;
