-- As duas views de reativacao, pelo mesmo motivo da 0088: `status = 'open'` e
-- vocabulario da Evolution, e uma barbearia na Cloud API sumia delas sem erro
-- nenhum. Ver o cabecalho da 0088.
--
-- **E uma correcao que veio junto:** a etapa 1 da reativacao apontava para o
-- template `reativacao` (nome_meta `sentimos_sua_falta`), que casa os tres
-- parametros mas **nao tem o botao "Nao quero mais receber"**. Sendo marketing,
-- isso e problema de LGPD e tambem de sobrevivencia do numero: sem caminho de
-- saida, quem nao quer receber bloqueia -- e bloqueio derruba a nota do numero,
-- que estrangula os lembretes, que sao o que da lucro. A economia se paga com a
-- funcionalidade que sustenta o produto.
--
-- Passa a usar `reativacao_convite`, que tem o opt-out. Como o corpo dela usa
-- dois parametros ({{1}} nome, {{2}} barbearia) e nao tres, a lista de
-- parametros muda junto -- mandar tres para um template de dois e recusado pela
-- Meta no envio.

drop view if exists public.clientes_para_avisar_retorno;
drop view if exists public.clientes_para_reativar;

create view public.clientes_para_avisar_retorno
with (security_invoker = on) as
 with config as (
   select s.id as salon_id, s.nome as barbearia, s.reativacao_dias, s.reativacao_dias_2
     from salons s where s.ativo and s.reativacao_dias > 0
 ), ultima_visita as (
   select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
     from appointments a where a.status = 'concluido'
    group by a.client_id, a.salon_id
 ), elegivel as (
   select c.id as client_id, cfg.salon_id, cfg.barbearia, c.nome, c.telefone,
          uv.em as visita,
          (current_date - ((uv.em at time zone 'America/Sao_Paulo'))::date) as dias,
          cfg.reativacao_dias, cfg.reativacao_dias_2,
          ca.provedor, ca.phone_number_id, ca.instance_name
     from config cfg
       join clients c on c.salon_id = cfg.salon_id
       join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
       join salons_com_automacao sa on sa.id = cfg.salon_id
       join public.conexoes_ativas ca on ca.salon_id = cfg.salon_id and ca.conectado
    where c.quer_aviso_de_retorno
      -- O consentimento e o carimbo, nunca a preferencia: `quer_aviso_de_retorno`
      -- nasce como true, e sozinho reivindicaria consentimento da base inteira.
      and c.aviso_de_retorno_em is not null
      and not c.recusou_contato
      and length(('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'))) >= 12
      and not exists (select 1 from appointments a2
                       where a2.client_id = c.id
                         and a2.status = any (array['agendado', 'confirmado'])
                         and a2.data_hora_inicio > now())
 ), com_etapa as (
   select e.*,
          case
            when e.reativacao_dias_2 > 0 and e.dias >= e.reativacao_dias_2
                 and not exists (select 1 from reativacao_envios r where r.client_id = e.client_id and r.etapa = 2 and r.criado_em > e.visita) then 2
            when e.dias >= e.reativacao_dias
                 and not exists (select 1 from reativacao_envios r where r.client_id = e.client_id and r.etapa = 1 and r.criado_em > e.visita) then 1
            else null::integer
          end as etapa
     from elegivel e
 )
 select ce.client_id, ce.salon_id, ce.barbearia, ce.nome as cliente,
    ce.dias as dias_sem_vir, ce.etapa,
    ce.provedor, ce.phone_number_id, ce.instance_name,
    ('55' || regexp_replace(ce.telefone, '\D', '', 'g')) as destino,
    t.nome_meta as template, t.idioma as template_idioma,
    -- A ordem segue o corpo de cada template, que difere entre os dois toques.
    case when ce.etapa = 1
      then jsonb_build_array(split_part(ce.nome, ' ', 1), ce.barbearia, tempo_sem_vir(ce.dias))
      else jsonb_build_array(split_part(ce.nome, ' ', 1), tempo_sem_vir(ce.dias), ce.barbearia)
    end as template_parametros
   from com_etapa ce
     join whatsapp_templates t
       on t.chave = case when ce.etapa = 1 then 'retorno_pedido' else 'retorno_pedido_segunda' end
      and t.status = 'aprovado' and t.ativo
  where ce.etapa is not null;

create view public.clientes_para_reativar
with (security_invoker = on) as
 with config as (
   select s.id as salon_id, s.nome as barbearia, s.reativacao_dias, s.reativacao_dias_2
     from salons s where s.ativo and s.reativacao_dias > 0
 ), ultima_visita as (
   select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
     from appointments a where a.status = 'concluido'
    group by a.client_id, a.salon_id
 ), elegivel as (
   select c.id as client_id, cfg.salon_id, cfg.barbearia, c.nome, c.telefone,
          uv.em as visita,
          (current_date - ((uv.em at time zone 'America/Sao_Paulo'))::date) as dias,
          cfg.reativacao_dias, cfg.reativacao_dias_2,
          ca.provedor, ca.phone_number_id, ca.instance_name
     from config cfg
       join clients c on c.salon_id = cfg.salon_id
       join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
       join salons_com_automacao sa on sa.id = cfg.salon_id
       join public.conexoes_ativas ca on ca.salon_id = cfg.salon_id and ca.conectado
    where not c.recusou_contato
      -- Quem pediu aviso de retorno sai por `clientes_para_avisar_retorno`, com
      -- template utility. Aqui fica so quem nao pediu, e por isso e marketing.
      and c.aviso_de_retorno_em is null
      and length(('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'))) >= 12
      and not exists (select 1 from appointments a2
                       where a2.client_id = c.id
                         and a2.status = any (array['agendado', 'confirmado'])
                         and a2.data_hora_inicio > now())
 ), com_etapa as (
   select e.*,
          case
            when e.reativacao_dias_2 > 0 and e.dias >= e.reativacao_dias_2
                 and not exists (select 1 from reativacao_envios r where r.client_id = e.client_id and r.etapa = 2 and r.criado_em > e.visita) then 2
            when e.dias >= e.reativacao_dias
                 and not exists (select 1 from reativacao_envios r where r.client_id = e.client_id and r.etapa = 1 and r.criado_em > e.visita) then 1
            else null::integer
          end as etapa
     from elegivel e
 )
 select ce.client_id, ce.salon_id, ce.barbearia, ce.nome as cliente,
    ce.dias as dias_sem_vir, ce.etapa,
    ce.provedor, ce.phone_number_id, ce.instance_name,
    ('55' || regexp_replace(ce.telefone, '\D', '', 'g')) as destino,
    t.nome_meta as template, t.idioma as template_idioma,
    -- A ordem e a quantidade seguem o corpo de cada template, nao um padrao
    -- unico: `reativacao_convite` tem dois parametros e `reativacao_tempo` tem
    -- tres. Ver `templates_com_parametros_errados`.
    case when ce.etapa = 1
      then jsonb_build_array(split_part(ce.nome, ' ', 1), ce.barbearia)
      else jsonb_build_array(split_part(ce.nome, ' ', 1), tempo_sem_vir(ce.dias), ce.barbearia)
    end as template_parametros
   from com_etapa ce
     join whatsapp_templates t
       on t.chave = case when ce.etapa = 1 then 'reativacao_convite' else 'reativacao_tempo' end
      and t.status = 'aprovado' and t.ativo
  where ce.etapa is not null;

-- Confere se cada template declara tantos parametros quantos o corpo usa.
--
-- Existe porque o erro acima seria invisivel ate a producao: uma view monta a
-- lista de parametros, o template espera outra quantidade, e a Meta so recusa
-- na hora do envio. Como nada sem `status = 'aprovado'` e enviado, o defeito
-- ficaria dormindo exatamente ate o dia em que os templates fossem aprovados --
-- ou seja, apareceria junto com todo o resto, no pior momento possivel.
create or replace view public.templates_com_parametros_errados
with (security_invoker = on) as
 select t.chave, t.nome_meta, t.categoria, t.status,
        (select count(distinct m[1])
           from regexp_matches(t.corpo, '\{\{(\d+)\}\}', 'g') m)::integer as no_corpo,
        jsonb_array_length(coalesce(t.parametros, '[]'::jsonb)) as declarados
   from whatsapp_templates t
  where (select count(distinct m[1]) from regexp_matches(t.corpo, '\{\{(\d+)\}\}', 'g') m)
        <> jsonb_array_length(coalesce(t.parametros, '[]'::jsonb));

comment on view public.clientes_para_avisar_retorno is
  'Quem PEDIU para ser avisado (aviso_de_retorno_em preenchido no caixa). Template utility. Conexao por conexoes_ativas, nao por status = open.';
comment on view public.clientes_para_reativar is
  'Quem NAO pediu aviso e sumiu. Template marketing, mais caro, com opt-out obrigatorio. Conexao por conexoes_ativas, nao por status = open.';
comment on view public.templates_com_parametros_errados is
  'Templates cujo corpo usa uma quantidade de {{n}} diferente da lista declarada em parametros. Deve estar sempre vazia: cada linha aqui e um envio que a Meta vai recusar em producao, e que nao aparece antes porque nada sem status = aprovado chega a ser enviado.';

revoke all on public.clientes_para_avisar_retorno from anon;
revoke all on public.clientes_para_reativar from anon;
revoke all on public.templates_com_parametros_errados from anon;
grant select on public.clientes_para_avisar_retorno to authenticated, service_role;
grant select on public.clientes_para_reativar to authenticated, service_role;
grant select on public.templates_com_parametros_errados to authenticated, service_role;
