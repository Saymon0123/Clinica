-- A fronteira do agente, na parte que dá para verificar.
--
-- `docs/visao.md` fechou em 2026-08-09 o `[ABERTO]` de "o que o agente nunca
-- deve fazer". As regras foram para o prompt, e prompt já falhou quatro vezes
-- neste projeto: a instrução de não inventar serviço não pegou, e só o filtro
-- na saída resolveu.
--
-- Então o que é detectável em SQL vira alarme. Quatro das seis famílias da
-- fronteira são: dinheiro, compromisso, preço fora do catálogo e saúde. As
-- outras duas (agenda alheia, identidade) dependem de contexto que a mensagem
-- sozinha não carrega — ficam com o prompt e com a leitura do dono.
--
-- Todas seguem o padrão da `0046`: janela de 7 dias, chave estável para avisar
-- uma vez só, e `security_invoker = on`.

create or replace view public.auditoria_fronteira
with (security_invoker = on) as

-- 1. Ofereceu dinheiro que não é dele.
--
-- Desconto, cortesia e fiado não passam por lugar nenhum do sistema: o barbeiro
-- descobre na cadeira, com o cliente na frente dele. Um cliente que ganhou vira
-- dez que pedem.
select
  'fronteira-dinheiro:' || m.id as chave,
  'Ofereceu desconto ou condicao de pagamento' as tipo,
  'grave' as gravidade,
  c.salon_id,
  m.created_at as ocorrido_em,
  'Mensagem: "' || left(m.content, 160) || '"' as detalhe
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
where m.direction = 'out' and m.sender = 'agente'
  and m.created_at > now() - interval '7 days'
  and m.content ~* '(desconto|cortesia|por conta da casa|promo[cç][aã]o|fiado|parcel|meia.entrada|de gra[cç]a|gratuit)'

union all

-- 2. Prometeu prazo, resultado ou garantia.
--
-- "Fica pronto em 20 minutos" e "se não gostar a gente refaz" são combinados que
-- o dono não fez. O agente não sabe quanto o barbeiro demora nem o que ele
-- aceita refazer.
select
  'fronteira-promessa:' || m.id,
  'Prometeu prazo, resultado ou garantia',
  'grave',
  c.salon_id,
  m.created_at,
  'Mensagem: "' || left(m.content, 160) || '"'
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
where m.direction = 'out' and m.sender = 'agente'
  and m.created_at > now() - interval '7 days'
  and m.content ~* '(fica pronto em|leva (cerca de|em torno de|uns)|garant[oi]|se (voc[eê] )?n[aã]o gostar|a gente refaz|refa[cç]o de gra|vai ficar ([oó]timo|lindo|perfeito))'

union all

-- 3. Citou preço que não está no catálogo.
--
-- A verificação mais forte das quatro, porque não depende de palavra: extrai
-- todo valor em reais da mensagem e confere contra os preços dos serviços
-- ativos daquela barbearia.
--
-- `R$ 45,00` e `45.00` viram o mesmo número antes de comparar. Valores até 5
-- são ignorados: quase sempre são "5 minutos" ou parte de outro número, e o
-- serviço mais barato de barbearia não custa isso.
select
  'fronteira-preco:' || m.id || ':' || v.valor,
  'Citou preco fora do catalogo',
  'grave',
  c.salon_id,
  m.created_at,
  'Disse R$ ' || v.valor || ' — mensagem: "' || left(m.content, 120) || '"'
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
cross join lateral (
  select distinct replace(replace(t[1], '.', ''), ',', '.')::numeric as valor
  from regexp_matches(m.content, 'R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)', 'g') as t
) v
where m.direction = 'out' and m.sender = 'agente'
  and m.created_at > now() - interval '7 days'
  and v.valor > 5
  and not exists (
    select 1 from public.services s
    where s.salon_id = c.salon_id and s.ativo and s.preco = v.valor
  )

union all

-- 4. Entrou em assunto de saúde.
--
-- Decidido em 2026-08-09 cortar tudo, inclusive o descritivo: o agente devolve
-- para a barbearia. "Pode fazer progressiva grávida" é uma frase que um modelo
-- produz com naturalidade, e nenhuma barbearia autorizou o sistema dela a
-- responder isso.
select
  'fronteira-saude:' || m.id,
  'Opinou sobre saude ou resultado capilar',
  'grave',
  c.salon_id,
  m.created_at,
  'Mensagem: "' || left(m.content, 160) || '"'
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
where m.direction = 'out' and m.sender = 'agente'
  and m.created_at > now() - interval '7 days'
  and m.content ~* '(queda de cabelo|couro cabeludo|caspa|alergi|dermatit|gr[aá]vid|gestante|amamenta|rem[eé]dio|medicament|dermatolog|cicatriz|ferida)';

comment on view public.auditoria_fronteira is
  'Violacoes da fronteira definida em visao.md, na parte verificavel em SQL. Alimenta auditoria_pendente junto com auditoria_do_agente.';

-- `auditoria_pendente` passa a ler as duas fontes. A trava de idempotência é a
-- mesma `auditoria_avisos`: chave gravada não volta a avisar.
create or replace view public.auditoria_pendente
with (security_invoker = on) as
select a.*
from (
  select * from public.auditoria_do_agente
  union all
  select * from public.auditoria_fronteira
) a
left join public.auditoria_avisos av on av.chave = a.chave
where av.chave is null
order by
  case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
  a.ocorrido_em desc;

revoke all on public.auditoria_fronteira from anon, authenticated;
grant select on public.auditoria_fronteira to service_role;
