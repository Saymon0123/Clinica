-- "Submetido" é um estado que a tabela não sabia dizer.
--
-- `whatsapp_templates.status` só conhecia `rascunho` e `aprovado`. Entre os dois
-- existe um terceiro estado que dura dias: **submetido à Meta, esperando
-- análise**. Sem ele, template enviado para aprovação é indistinguível de
-- template que ninguém tocou.
--
-- Isso já custou leitura errada: a auditoria apurou "nenhum dos 25 templates foi
-- submetido (todos `rascunho`)" — afirmação correta na época, mas que a tabela
-- não teria como desmentir se alguns já estivessem em análise.
--
-- Em 01/10/2026 os três templates da fila de espera foram submetidos de fato, e
-- a Meta devolveu `PENDING` / `UTILITY` nos três. Sem esta migration o banco
-- diria que eles continuam em rascunho.
--
-- ## Por que `em_analise` é seguro
--
-- As duas views que ENVIAM (`avaliacoes_a_pedir` e `vencimentos_a_avisar`)
-- filtram por `status = 'aprovado'` — conferido. Então o estado novo não envia
-- nada, do mesmo jeito que `rascunho` não envia. Não há CHECK em `status` nesta
-- tabela, então nada precisa ser derrubado e recriado.
--
-- ## Por que guardar o id da Meta
--
-- Para perguntar o estado de um template específico sem depender de casar por
-- nome. `GET /{meta_template_id}` responde o `status` atual; procurar pelo nome
-- na lista da WABA funciona até o dia em que existirem duas versões do mesmo
-- nome em idiomas diferentes.
--
-- A coluna nova herda os grants porque nesta tabela eles são de TABELA, não por
-- coluna — conferido antes de escrever, que é a regra depois da 0189 e da 0191.
-- E não há risco em `anon` ter esses grants: a RLS está ligada **sem nenhuma
-- policy**, o estado mais fechado possível. Medido: como `anon`, o select
-- devolve 0 linhas, o update afeta 0 e o insert é recusado com 42501.

alter table public.whatsapp_templates
  add column meta_template_id text;

comment on column public.whatsapp_templates.meta_template_id is
  'Id que a Meta devolveu ao criar o template. Serve para perguntar o estado dele direto (GET /{id}) em vez de casar por nome na lista da WABA.';

comment on column public.whatsapp_templates.status is
  'rascunho = escrito, nunca submetido. em_analise = submetido, a Meta ainda nao respondeu. aprovado = liberado para envio. So `aprovado` envia: as views de envio filtram por ele.';

-- Os três da fila de espera, submetidos em 01/10/2026. A Meta devolveu
-- `category: UTILITY` nos três na criação — o que não é veredito final: ela pode
-- recategorizar na análise, e é a view `templates_recategorizados` que avisa.
-- Por isso `categoria_meta` continua nulo aqui: ele só é preenchido com o que a
-- Meta confirmar no fim.
update public.whatsapp_templates
   set status = 'em_analise',
       meta_template_id = '1401421392139416',
       atualizado_em = now()
 where chave = 'fila_vaga_abriu';

update public.whatsapp_templates
   set status = 'em_analise',
       meta_template_id = '2213231590076636',
       atualizado_em = now()
 where chave = 'fila_vaga_perdida';

update public.whatsapp_templates
   set status = 'em_analise',
       meta_template_id = '1754010445665149',
       atualizado_em = now()
 where chave = 'fila_espera_encerrada';
