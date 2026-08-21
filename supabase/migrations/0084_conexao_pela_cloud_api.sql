-- A conexao passa a saber falar Cloud API, sem perder a Evolution.
--
-- **As duas convivem de proposito.** Trocar tudo de uma vez deixaria as
-- barbearias mudas no intervalo. Cada barbearia migra quando o numero dela for
-- conectado, e `provedor` diz por onde ela fala hoje.
--
-- **`phone_number_id` substitui o `instance_name` como chave do inquilino, e
-- isso e um ganho de seguranca, nao so de nome.** Hoje a traducao e feita por
-- string (`salon-<uuid>`, ver `_shared/instanceName.ts`), e o comentario de la
-- avisa: o n8n grava com `service_role`, que ignora RLS, entao um erro na
-- extracao do UUID grava a mensagem na barbearia errada e nada impede. Consulta
-- ao banco por chave unica nao tem esse modo de falha: ou acha, ou nao acha.

alter table public.whatsapp_connections
  add column if not exists phone_number_id text,
  add column if not exists waba_id text,
  add column if not exists provedor text not null default 'evolution'
    check (provedor in ('evolution', 'cloud_api'));

create unique index if not exists whatsapp_connections_phone_number_id_idx
  on public.whatsapp_connections (phone_number_id)
  where phone_number_id is not null;

comment on column public.whatsapp_connections.phone_number_id is
  'Identificador do numero na Cloud API. E a CHAVE DO INQUILINO: e por ele que o webhook descobre de qual barbearia e a mensagem que chegou. Unico, e consultado no banco -- nunca derivado de string, como era o instance_name.';
comment on column public.whatsapp_connections.waba_id is
  'WhatsApp Business Account que contem o numero. Guardado para chamar a API de templates, que e por WABA e nao por numero.';
comment on column public.whatsapp_connections.provedor is
  'Por onde esta barbearia fala hoje: evolution (nao oficial) ou cloud_api (oficial). Existe para as duas conviverem durante a migracao -- trocar todas de uma vez deixaria as barbearias mudas no intervalo.';

-- De qual barbearia e este numero?
--
-- Uma funcao, e nao um `select` solto em cada ponta, porque quem pergunta e o
-- webhook rodando com service_role: se a resposta vier errada, a mensagem e
-- gravada na barbearia errada sem que a RLS tenha como impedir. Devolve NULO --
-- nunca um palpite -- quando o numero nao e conhecido.
create or replace function public.salon_por_phone_number_id(p_phone_number_id text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select wc.salon_id
    from public.whatsapp_connections wc
   where wc.phone_number_id = p_phone_number_id
     and wc.provedor = 'cloud_api'
   limit 1;
$$;

revoke execute on function public.salon_por_phone_number_id(text) from anon, authenticated;

comment on function public.salon_por_phone_number_id(text) is
  'Traduz o phone_number_id da Cloud API para o salon_id. Devolve NULO quando o numero nao e conhecido -- quem chama deve parar, jamais seguir com uma barbearia arbitraria.';
