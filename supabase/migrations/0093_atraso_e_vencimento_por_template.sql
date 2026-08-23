-- Atraso e fim de teste passam a dizer QUAL template usar e com quais
-- parametros -- como a reativacao ja fazia.
--
-- **Por que agora, se nenhum template esta aprovado.** Na API oficial, mensagem
-- iniciada pela empresa exige template. Enquanto a Meta nao aprova, estas views
-- ficam **vazias**, e por isso os fluxos do n8n nao tem o que enviar. Isso e o
-- comportamento desejado: a trava mora no banco, nao num IF do n8n que alguem
-- esquece de repetir na automacao seguinte.
--
-- O `texto` continua exposto de proposito. Ele e a versao em texto livre, que
-- so pode ser usada dentro da janela de 24h -- mais barata, porque conversa de
-- servico e gratuita ate 2026-10-01. Nenhum fluxo usa hoje; fica documentando a
-- redacao pretendida e pronto para quando a janela for considerada.
--
-- As chaves internas nao sao os nomes na Meta: `atraso_esta_vindo` vira
-- `cliente_atrasado`, `fim_de_teste` vira `fim_do_teste_gratis`. Por isso o
-- join e por `chave` e o que sai para o n8n e `nome_meta`. Essa diferenca ja
-- causou erro uma vez -- ver a 0089, em que a etapa 1 da reativacao apontava
-- para o template errado.

drop view if exists public.atrasos_para_perguntar;

create view public.atrasos_para_perguntar
with (security_invoker = on) as
 with conversa as (
   select c_1.id as client_id, w.contact_phone, w.agent_paused
     from clients c_1
     join whatsapp_conversations w
       on w.salon_id = c_1.salon_id
      and right(regexp_replace(w.contact_phone, '\D', '', 'g'), 8) = c_1.telefone_norm
 )
 select a.id as appointment_id,
    a.salon_id,
    s.nome as barbearia,
    c.nome as cliente,
    ca.provedor,
    ca.phone_number_id,
    ca.instance_name,
    to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI') as hora_marcada,
    (floor((extract(epoch from (now() - a.data_hora_inicio)) / 60)))::integer as minutos_de_atraso,
    coalesce(regexp_replace(conv.contact_phone, '\D', '', 'g'), ('55' || regexp_replace(c.telefone, '\D', '', 'g'))) as destino,
    t.nome_meta as template,
    t.idioma as template_idioma,
    -- Ordem do corpo: "Oi, {{1}}! Aqui e da *{{2}}*. Seu horario era {{3}}..."
    jsonb_build_array(
      split_part(c.nome, ' ', 1),
      s.nome,
      to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI')
    ) as template_parametros,
    'Oi, ' || split_part(c.nome, ' ', 1) || '! Aqui e da *' || s.nome || '*.' || chr(10) || chr(10)
      || 'Seu horario era ' || to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI')
      || ' e a cadeira esta te esperando. Consegue chegar nos proximos minutos?' as texto
   from appointments a
     join salons s on s.id = a.salon_id
     join clients c on c.id = a.client_id
     join salons_com_automacao sa on sa.id = a.salon_id
     join public.conexoes_ativas ca on ca.salon_id = a.salon_id and ca.conectado
     join public.whatsapp_templates t
       on t.chave = 'atraso_esta_vindo' and t.status = 'aprovado' and t.ativo
     left join conversa conv on conv.client_id = c.id
  where a.status = any (array['agendado', 'confirmado'])
    and a.chegou_em is null
    and a.iniciado_em is null
    and a.atraso_perguntado_em is null
    and coalesce(conv.agent_paused, false) = false
    and now() >= (a.data_hora_inicio + make_interval(mins => s.atraso_tolerado_minutos))
    and now() < (a.data_hora_inicio + '01:00:00'::interval)
    and length(coalesce(regexp_replace(conv.contact_phone, '\D', '', 'g'), ('55' || regexp_replace(c.telefone, '\D', '', 'g')))) >= 12;

drop view if exists public.vencimentos_a_avisar;

create view public.vencimentos_a_avisar
with (security_invoker = on) as
 select v.salon_id, v.salao, v.acesso_ate, v.dias_restantes,
        v.provedor, v.phone_number_id, v.instance_name,
        v.destino, v.chave,
        t.nome_meta as template,
        t.idioma as template_idioma,
        -- Corpo: "O teste gratis do Club Cut na *{{1}}* acaba {{2}}."
        jsonb_build_array(
          v.salao,
          case v.dias_restantes
            when 0 then 'hoje'
            else 'em ' || v.dias_restantes || ' dias, no dia ' || to_char((v.acesso_ate)::timestamptz, 'DD/MM')
          end
        ) as template_parametros,
        v.texto
   from vencimentos_proximos v
     join public.whatsapp_templates t
       on t.chave = 'fim_de_teste' and t.status = 'aprovado' and t.ativo
     left join auditoria_avisos a on a.chave = v.chave
  where a.chave is null
    and v.provedor is not null
    and length(v.destino) >= 12;

comment on view public.atrasos_para_perguntar is
  'Atrasados que ainda cabe perguntar, ja com o template e os parametros na ordem do corpo. VAZIA enquanto o template atraso_esta_vindo nao estiver aprovado -- de proposito: na API oficial nao ha envio iniciado pela empresa sem template, e a trava mora aqui e nao num IF do n8n.';
comment on view public.vencimentos_a_avisar is
  'Vencimentos a avisar, com template e parametros. VAZIA enquanto fim_de_teste nao estiver aprovado, pelo mesmo motivo de atrasos_para_perguntar.';

revoke all on public.atrasos_para_perguntar from anon;
revoke all on public.vencimentos_a_avisar from anon;
grant select on public.atrasos_para_perguntar to authenticated, service_role;
grant select on public.vencimentos_a_avisar to authenticated, service_role;
