-- Limitador de taxa para as edge functions publicas (2026-08-25).
--
-- O giro achou tres portas sem freio: `accept-invite` aceitava forca bruta de
-- senha (resposta distinguivel + tentativas ilimitadas), o `verify` do painel
-- admin aceitava adivinhacao da senha da operacao, e a agenda publica criava
-- um cliente novo por requisicao de robo.
--
-- Janela fixa, uma linha por chave: simples e suficiente. A chave codifica o
-- alvo ("invite-senha:<token>", "admin:<ip>", "agenda:<ip>"); estourou o
-- limite dentro da janela, a funcao devolve true e a edge responde 429.
-- SECURITY DEFINER restrita a service_role -- so as edge functions chamam.

create table public.controle_de_taxa (
  chave text primary key,
  contagem integer not null default 1,
  janela_inicio timestamptz not null default now()
);

alter table public.controle_de_taxa enable row level security;
-- Sem policies de proposito: so service_role toca.

create or replace function public.taxa_excedida(
  p_chave text,
  p_limite integer,
  p_janela_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contagem integer;
begin
  insert into public.controle_de_taxa as t (chave, contagem, janela_inicio)
  values (p_chave, 1, now())
  on conflict (chave) do update set
    contagem = case
      when now() - t.janela_inicio > make_interval(secs => p_janela_segundos) then 1
      else t.contagem + 1
    end,
    janela_inicio = case
      when now() - t.janela_inicio > make_interval(secs => p_janela_segundos) then now()
      else t.janela_inicio
    end
  returning contagem into v_contagem;

  return v_contagem > p_limite;
end;
$$;

revoke execute on function public.taxa_excedida(text, integer, integer) from public, anon, authenticated;
grant execute on function public.taxa_excedida(text, integer, integer) to service_role;

-- Higiene: a poda mensal ja existente leva as janelas mortas junto.
create or replace function public.poda_historico_antigo()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
  v_qtd integer;
begin
  delete from public.whatsapp_messages where created_at < now() - interval '12 months';
  get diagnostics v_qtd = row_count;
  v_total := v_total + v_qtd;

  delete from public.auditoria_avisos where avisado_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count;
  v_total := v_total + v_qtd;

  delete from public.asaas_eventos where recebido_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count;
  v_total := v_total + v_qtd;

  delete from public.controle_de_taxa where janela_inicio < now() - interval '7 days';
  get diagnostics v_qtd = row_count;
  v_total := v_total + v_qtd;

  return v_total;
end;
$$;
