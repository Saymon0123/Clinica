-- 0181: o e-mail que para avisa na tela.
--
-- O QUE ACONTECEU. Em 20/09 às 15:08 a caixa `contato@clubcut.space` parou de
-- autenticar (535). Os nós de e-mail do n8n têm saída de erro, então cada
-- execução fechou como "sucesso" e o robô falhou EM SILÊNCIO a cada 5 minutos.
-- Ficou assim **quatro dias**, e só apareceu em 24/09 porque o dono foi testar
-- um cadastro e levou um 500 na cara — o Auth do Supabase usa a mesma caixa, e
-- sem conseguir mandar a confirmação ele recusa o signup inteiro. Ou seja: a
-- porta de entrada do produto ficou fechada quatro dias sem ninguém saber.
--
-- POR QUE O ALARME NÃO PODE SER UM E-MAIL. `canal_de_alertas` está com
-- `provedor = 'email'`: um aviso de "os e-mails não estão saindo" enviado por
-- e-mail é circular — ele só chega quando não é mais necessário. O mesmo vale
-- para a fila `auditoria_pendente`, que é lida e despachada por e-mail.
--
-- Então o aviso vai para onde o dono **já olha todo dia e não depende de
-- terceiro nenhum**: a tela do CRM, ao lado do aviso de assinatura.
--
-- COMO SE DETECTA. Não se pergunta ao n8n se ele falhou — ele acha que não
-- falhou. Olha-se o SINTOMA, que é o que a 0165 já faz com os crons: fila que
-- devia esvaziar e não esvazia. Duas filas marcam a hora do envio depois de
-- enviar, e é justamente esse desenho ("marca só depois de enviar") que as
-- torna um termômetro confiável:
--
--   · `feedbacks.notificado_em`      — robô a cada 5 minutos;
--   · `salon_invites.email_enviado_em` — robô a cada 10 minutos.
--
-- A TOLERÂNCIA É DE 20 MINUTOS, folgada de propósito: dois a quatro ciclos.
-- Alarme que dispara no atraso normal do agendador vira ruído, e ruído se
-- aprende a ignorar — foi o que a 0165 escreveu e continua valendo.
--
-- O QUE FICA DE FORA, e é decisão consciente: convite cujo link o dono copiou
-- na tela e a pessoa já aceitou (`usado_em`), e convite vencido. Nos dois o
-- e-mail deixou de importar, e cobrá-lo viraria alarme que não se apaga.
--
-- POR SALÃO, E NÃO DA PLATAFORMA. Quem abre o CRM é dono de barbearia, não
-- administrador de servidor: ele precisa saber que **o convite dele** não
-- saiu, não que "o SMTP caiu". A função devolve número e data; a frase é da
-- tela.

create or replace function public.entregas_presas(p_salon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with autorizado as (
    -- Definer ignora RLS: a autorização mora aqui dentro, como em
    -- `metricas_do_cliente` (0174) e `situacao_do_acesso`.
    select 1 where p_salon_id in (select private.salon_ids())
  ),
  atrasadas as (
    select 'feedback'::text as fila, f.created_at as desde
      from public.feedbacks f
     where f.salon_id = p_salon_id
       and f.notificado_em is null
       and f.created_at < now() - interval '20 minutes'
    union all
    select 'convite', i.created_at
      from public.salon_invites i
     where i.salon_id = p_salon_id
       and i.email_enviado_em is null
       and i.usado_em is null
       and i.expira_em > now()
       and i.created_at < now() - interval '20 minutes'
  )
  select jsonb_build_object(
    'presas', (select count(*) from atrasadas),
    'convites', (select count(*) from atrasadas where fila = 'convite'),
    'feedbacks', (select count(*) from atrasadas where fila = 'feedback'),
    -- A hora do mais antigo é o que responde "desde quando", que é a
    -- pergunta que o dono faz depois de "o quê".
    'desde', (select min(desde) from atrasadas)
  )
  from autorizado;
$function$;

comment on function public.entregas_presas(uuid) is
  'Quantos e-mails DESTE salao estao presos na fila ha mais de 20 minutos (feedback e convite de equipe), e desde quando. Alimenta a faixa de aviso do CRM. Existe porque em 20/09 a caixa de e-mail caiu e ficou QUATRO DIAS em silencio: os nos do n8n tem saida de erro e fecham como sucesso, e o alarme por e-mail seria circular. Sem vinculo com o salao, devolve nulo.';

-- Sem vínculo, a função devolve nulo (o `from autorizado` não produz linha) —
-- mas o trinco entra mesmo assim: `anon` não tem o que fazer aqui, e função
-- nova nasce com execute para `public`.
revoke execute on function public.entregas_presas(uuid) from public, anon;
grant execute on function public.entregas_presas(uuid) to authenticated, service_role;
