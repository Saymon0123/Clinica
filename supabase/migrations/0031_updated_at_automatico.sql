-- `updated_at` existia mas ninguém o mantinha: só era preenchido quando o
-- código lembrava de mandá-lo junto. Apareceu ao testar o webhook do Asaas em
-- 2026-08-02 — a cobrança foi confirmada, `status` virou 'ativa' e `acesso_ate`
-- avançou um mês, mas `updated_at` continuou apontando para uma alteração
-- manual de quinze minutos antes.
--
-- Um carimbo de data que mente é pior que campo nenhum: ninguém desconfia dele.
-- Hoje nenhuma tela o lê, então nada quebrou; o risco é a primeira que ler.
--
-- Vale para as duas tabelas que têm a coluna. `whatsapp_connections` é a mais
-- perigosa das duas: "quando essa conexão mudou pela última vez" é exatamente o
-- tipo de pergunta que se faz ao investigar WhatsApp fora do ar.

create or replace function public.marca_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.marca_updated_at();

create trigger whatsapp_connections_updated_at
  before update on public.whatsapp_connections
  for each row execute function public.marca_updated_at();
