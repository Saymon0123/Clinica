-- Habilita Realtime para o dashboard Financeiro refletir mudanças em tempo real.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table clients;
