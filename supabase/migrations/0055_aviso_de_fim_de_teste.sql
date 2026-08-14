-- Aviso de fim do teste, por WhatsApp.
--
-- Até aqui o aviso de vencimento só existia DENTRO do CRM, e só aparecia se o
-- dono entrasse. Quem se cadastrou, testou dois dias e não voltou não recebia
-- nada: o acesso simplesmente morria. Com cinco barbearias já havia duas
-- vencidas sem pagar — num funil de anúncio isso vira a maioria.
--
-- É o único vazamento do funil que perde gente que **já demonstrou interesse**.
--
-- O texto é montado aqui, e não no n8n, pelo mesmo motivo das outras views: a
-- data, o prazo e o que acontece depois são determinísticos, e no banco estão
-- ao lado do dado que os define.

create or replace view public.vencimentos_proximos
with (security_invoker = on) as
select
  s.id as salon_id,
  s.nome as salao,
  sub.acesso_ate,
  (sub.acesso_ate - current_date) as dias_restantes,
  wc.instance_name,

  -- Para quem mandar: o telefone do dono, caindo no da barbearia.
  '55' || regexp_replace(
    coalesce(
      (select p.telefone
         from public.professionals p
         join public.user_salons us on us.user_id = p.user_id and us.salon_id = s.id
        where p.salon_id = s.id and us.role = 'owner' and p.telefone is not null
        limit 1),
      s.telefone
    ), '\D', '', 'g') as destino,

  'vencimento:' || s.id || ':' || to_char(sub.acesso_ate, 'YYYY-MM-DD') ||
    ':' || (sub.acesso_ate - current_date) as chave,

  case (sub.acesso_ate - current_date)
    when 3 then
      'Oi! Passando pra avisar que o teste gratis do Club Cut na *' || s.nome ||
      '* acaba em 3 dias, no dia ' || to_char(sub.acesso_ate, 'DD/MM') ||
      '.' || chr(10) || chr(10) ||
      'Pra continuar com a agenda e o atendimento automatico no WhatsApp, e so assinar dentro do sistema, em Assinatura.'
    else
      'Oi! O teste gratis do Club Cut na *' || s.nome || '* acaba hoje.' ||
      chr(10) || chr(10) ||
      'O acesso ao sistema bloqueia amanha, mas o atendimento automatico no WhatsApp continua por mais 3 dias. Se quiser seguir, e so assinar em Assinatura.'
  end as texto

from public.salons s
join public.subscriptions sub on sub.salon_id = s.id
left join public.whatsapp_connections wc on wc.salon_id = s.id and wc.status = 'open'
where s.ativo
  and sub.status = 'trial'
  and sub.acesso_ate is not null
  -- Dois momentos: 3 dias antes, e no dia. Um aviso só seria fraco; um por dia
  -- seria cobrança.
  and (sub.acesso_ate - current_date) in (0, 3);

comment on view public.vencimentos_proximos is
  'Barbearias em teste vencendo hoje ou em 3 dias, com o texto do aviso pronto. O calculo vive aqui porque e deterministico e mora ao lado do dado.';

-- O que ainda não foi avisado. Mesma trava de `auditoria_avisos`, e pelo mesmo
-- motivo: reexecução do fluxo não pode reenviar.
create or replace view public.vencimentos_a_avisar
with (security_invoker = on) as
select v.*
from public.vencimentos_proximos v
left join public.auditoria_avisos a on a.chave = v.chave
where a.chave is null
  -- Sem instância conectada ou sem telefone não há como enviar. Esses casos
  -- caem na auditoria (migration 0056), para você avisar na mão — senão
  -- venceriam em silêncio, que é o vazamento que este aviso veio tapar.
  and v.instance_name is not null
  and length(v.destino) >= 12;

comment on view public.vencimentos_a_avisar is
  'Avisos de vencimento ainda nao enviados e que TEM como ser enviados. Consumida pelo n8n.';

revoke all on public.vencimentos_proximos, public.vencimentos_a_avisar from anon, authenticated;
grant select on public.vencimentos_proximos to service_role;
grant select on public.vencimentos_a_avisar to service_role;
