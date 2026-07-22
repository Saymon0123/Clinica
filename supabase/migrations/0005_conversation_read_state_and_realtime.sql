alter table whatsapp_conversations add column last_opened_at timestamptz;

alter publication supabase_realtime add table appointments;
