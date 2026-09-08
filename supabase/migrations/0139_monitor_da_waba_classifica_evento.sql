-- 0139: o monitor da WABA (0116) classifica o evento em vez de gritar por tudo.
--
-- Defeito encontrado em 2026-09-08: o ramo `qualidade-waba` da auditoria_operacao
-- gerava um alerta **grave** para QUALQUER linha de `eventos_da_waba`, com o texto
-- fixo "Nota baixa degrada o alcance da plataforma inteira". Mas o webhook grava ali
-- TODO evento administrativo da Meta -- inclusive `message_template_status_update`
-- com event=APPROVED. Resultado: os 8 templates aprovados no dia dispararam 8 alertas
-- "graves" de nota baixa (falso positivo), e a recusa do nome verificado
-- (`phone_number_name_update` REJECTED) virou "nota baixa" -- sendo que a nota real
-- do numero estava GREEN.
--
-- Agora o ramo classifica pelo `campo` e pelo conteudo:
--   - phone_number_quality_update (fora UPGRADE) -> GRAVE: e a nota/limite do numero
--     central caindo, que e o que a 0116 realmente queria pegar; degrada os lembretes
--     de todas as barbearias.
--   - account_update com ban/restricao/violacao/disable -> GRAVE (conta do numero);
--     outros account_update -> aviso.
--   - phone_number_name_update REJECTED/DECLINED -> AVISO de branding (nao afeta envio,
--     afeta so a apresentacao); APPROVED nao alerta.
--   - eventos de template (status/qualidade/categoria) -> NAO alertam aqui: templates
--     tem tratamento proprio (whatsapp_templates, templates_recategorizados).
--   - campo desconhecido -> aviso neutro, para nao engolir um sinal novo da Meta.
--
-- Colunas da view inalteradas, entao create or replace basta (auditoria_pendente,
-- que depende dela, continua valendo).

create or replace view public.auditoria_operacao
with (security_invoker = on) as
select 'trial-no-teto:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD') as chave,
       'Teste gratis atingiu o teto de uso' as tipo, 'aviso' as gravidade,
       s.id as salon_id, now() as ocorrido_em,
       s.nome || ' -- ' || u.recebidas_no_total || ' mensagens no teste, ' || u.recebidas_hoje
         || ' hoje. O agente parou de responder.' as detalhe
  from public.salons s
  join public.subscriptions sub on sub.salon_id = s.id
  join public.uso_do_agente u on u.salon_id = s.id
 where s.ativo and sub.status = 'trial'
   and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400)
union all
select 'whatsapp-caiu:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
       'WhatsApp desconectado', 'grave', s.id, now(),
       case ca.provedor
         when 'cloud_api' then s.nome || ' -- o numero nao esta registrado na Cloud API. Nenhum cliente esta sendo atendido.'
         else s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') || ' desde '
              || to_char(wc.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
              || '. Nenhum cliente esta sendo atendido.'
       end
  from public.salons s
  join public.conexoes_ativas ca on ca.salon_id = s.id
  join public.whatsapp_connections wc on wc.salon_id = s.id
 where s.ativo and not ca.conectado
   and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
   and exists (select 1 from public.whatsapp_messages m
                join public.whatsapp_conversations c on c.id = m.conversation_id
               where c.salon_id = s.id)
union all
select 'vencimento-sem-canal:' || v.salon_id || ':' || to_char(v.acesso_ate, 'YYYY-MM-DD'),
       'Teste vencendo e sem como avisar', 'aviso', v.salon_id, now(),
       v.salao || ' -- o teste acaba '
         || case v.dias_restantes when 0 then 'hoje' else 'em ' || v.dias_restantes || ' dias' end
         || ' e nao ha como avisar automaticamente ('
         || case when v.provedor is null then 'WhatsApp desconectado' else 'sem telefone cadastrado' end
         || '). Fale com o dono.'
  from public.vencimentos_proximos v
 where v.provedor is null or length(v.destino) < 12
union all
select 'dia-sem-barbeiro:' || s.id || ':' || dia.chave || ':' || to_char(current_date, 'YYYY-MM-DD'),
       'Barbearia abre num dia sem barbeiro', 'grave', s.id, now(),
       s.nome || ' -- abre ' || dia.nome
         || ' mas nenhum barbeiro tem jornada nesse dia. Ninguem consegue agendar, nem pelo WhatsApp nem pelo QR.'
  from public.salons s
  cross join (values (0,'dom','domingo'),(1,'seg','segunda'),(2,'ter','terca'),(3,'qua','quarta'),
                     (4,'qui','quinta'),(5,'sex','sexta'),(6,'sab','sabado')) dia(numero, chave, nome)
 where s.ativo
   and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
   and (s.horario_funcionamento -> dia.chave) ? 'abre'
   and not exists (select 1 from public.professional_schedules ps
                    join public.professionals p on p.id = ps.professional_id
                   where p.salon_id = s.id and p.ativo and ps.ativo and ps.dia_semana = dia.numero)
   and exists (select 1 from public.professionals p where p.salon_id = s.id and p.ativo)
union all
select 'whatsapp-nunca-conectou:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
       'WhatsApp nunca terminou de conectar', 'grave', s.id, now(),
       case ca.provedor
         when 'cloud_api' then s.nome || ' -- o numero foi cadastrado mas nunca ficou registrado na Cloud API, e essa barbearia NUNCA recebeu uma mensagem. O agente nao funciona para ela, e o dono nao tem como saber.'
         else s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') || ' desde '
              || to_char(wc.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
              || ' e essa barbearia NUNCA recebeu uma mensagem. Provavelmente o QR nunca foi lido ate o fim. O agente nao funciona para ela, e o dono nao tem como saber.'
       end
  from public.salons s
  join public.conexoes_ativas ca on ca.salon_id = s.id
  join public.whatsapp_connections wc on wc.salon_id = s.id
 where s.ativo and not ca.conectado
   and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
   and not exists (select 1 from public.whatsapp_messages m
                    join public.whatsapp_conversations c on c.id = m.conversation_id
                   where c.salon_id = s.id)
   and wc.updated_at < now() - interval '2 hours'
union all
-- Saude do NUMERO CENTRAL, agora classificada. Ver o cabecalho.
select 'qualidade-waba:' || e.id as chave,
       case e.campo
         when 'phone_number_quality_update' then 'Nota de qualidade do numero central'
         when 'phone_number_name_update' then 'Nome verificado do numero central recusado'
         when 'account_update' then 'Evento na conta do numero central'
         else 'Aviso da Meta sobre o numero central'
       end as tipo,
       case
         when e.campo = 'phone_number_quality_update' then 'grave'
         when e.campo = 'account_update' and upper(e.evento::text) ~ 'BAN|RESTRICT|VIOLAT|DISABLE' then 'grave'
         else 'aviso'
       end as gravidade,
       null::uuid as salon_id,
       e.criado_em as ocorrido_em,
       case
         when e.campo = 'phone_number_quality_update' then
           'A NOTA de qualidade do numero central (' || coalesce(e.evento->>'display_phone_number', '') || ') mudou: '
             || left(e.evento::text, 300)
             || '. Nota baixa ou limite reduzido degrada os lembretes de TODAS as barbearias. Conferir no WhatsApp Manager.'
         when e.campo = 'phone_number_name_update' then
           'O NOME verificado do numero central foi ' || coalesce(e.evento->>'decision', '?')
             || ' (motivo ' || coalesce(e.evento->>'rejection_reason', '-') || '). NAO afeta o envio; afeta so a '
             || 'apresentacao (o cliente ve o numero, nao o nome). Re-submeter o nome no WhatsApp Manager.'
         when e.campo = 'account_update' then
           'A CONTA do numero central teve um evento administrativo: ' || left(e.evento::text, 300)
             || '. Pode afetar a plataforma inteira. Conferir no WhatsApp Manager.'
         else
           'Evento novo da Meta sobre o numero central (' || e.campo || '): ' || left(e.evento::text, 300)
             || '. Conferir no WhatsApp Manager.'
       end as detalhe
  from public.eventos_da_waba e
 where e.criado_em > now() - interval '30 days'
   -- templates tem tratamento proprio; nao sao saude do numero
   and e.campo not in ('message_template_status_update', 'message_template_quality_update', 'template_category_update')
   -- ruido benigno que nao merece alerta
   and not (e.campo = 'phone_number_name_update' and upper(coalesce(e.evento->>'decision', '')) = 'APPROVED')
   and not (e.campo = 'phone_number_quality_update' and upper(coalesce(e.evento->>'event', '')) like '%UPGRADE%')
   and not (e.campo = 'account_update' and upper(coalesce(e.evento->>'event', '')) in
            ('VERIFIED_ACCOUNT', 'ACCOUNT_VERIFIED', 'PARTNER_ADDED', 'PARTNER_REMOVED'));

comment on view public.auditoria_operacao is
  'Alertas de operacao/infra da plataforma. O ramo qualidade-waba classifica o evento da Meta (0139): quality_update=grave, account restrito=grave, name_update recusado=aviso de branding, template=ignorado.';
