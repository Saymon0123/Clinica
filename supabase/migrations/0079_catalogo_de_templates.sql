-- Vinte templates para submeter a Meta de uma vez: 10 de lembrete e 10 de
-- recuperacao. Com os 3 da 0076, o catalogo fecha em 23.
--
-- **Por que varios, e nao um de cada.** Tres motivos praticos:
-- 1. A Meta reprova ou recategoriza parte do que voce manda. Submeter dez de
--    cada garante que sobre algo utilizavel mesmo perdendo alguns.
-- 2. Repetir a mesma frase para todo mundo aumenta bloqueio, e bloqueio derruba
--    a nota do numero.
-- 3. Situacoes diferentes pedem textos diferentes: lembrar de um horario de
--    hoje nao e a mesma coisa que lembrar do primeiro horario de um cliente
--    novo, que precisa do endereco.
--
-- **A recuperacao vem em duas familias, de proposito:**
-- - `retorno_*` sao UTILIDADE porque continuam um pedido que o cliente fez
--   ("me avisa quando der tempo"). ~R$ 0,04.
-- - `reativacao_*` sao MARKETING porque nao continuam nada. ~R$ 0,35.
--
-- **Regras da Meta ja aplicadas nos textos:** nome so com minuscula e
-- underscore; nenhum corpo comeca nem termina com variavel; nao ha duas
-- variaveis coladas; no maximo tres botoes de resposta rapida.

insert into public.whatsapp_templates (chave, nome_meta, categoria, corpo, parametros, botoes, status) values

-- ---------- LEMBRETES (utilidade) ----------
('lembrete_hoje', 'lembrete_hoje', 'utility',
 'Oi, {{1}}! Seu horario na *{{2}}* e hoje as {{3}}, com {{4}}. Voce vem?',
 '["primeiro nome","barbearia","hora HH:MM","barbeiro"]'::jsonb,
 '["Sim, confirmo","Reagendar","Cancelar"]'::jsonb, 'rascunho'),

('lembrete_amanha', 'lembrete_amanha', 'utility',
 'Oi, {{1}}! Seu horario na *{{2}}* e amanha as {{3}}, com {{4}}. Confirma?',
 '["primeiro nome","barbearia","hora HH:MM","barbeiro"]'::jsonb,
 '["Sim, confirmo","Reagendar","Cancelar"]'::jsonb, 'rascunho'),

('lembrete_primeira_vez', 'lembrete_primeira_vez', 'utility',
 'Oi, {{1}}! Seu primeiro horario na *{{2}}* e {{3}} as {{4}}. Estamos em {{5}}. Ate la!',
 '["primeiro nome","barbearia","dia","hora HH:MM","endereco"]'::jsonb,
 '["Sim, confirmo","Reagendar","Cancelar"]'::jsonb, 'rascunho'),

('agendamento_confirmado', 'agendamento_confirmado', 'utility',
 'Prontinho, {{1}}! Seu horario na *{{2}}* ficou {{3}} as {{4}}, com {{5}}.',
 '["primeiro nome","barbearia","dia","hora HH:MM","barbeiro"]'::jsonb,
 '["Cancelar"]'::jsonb, 'rascunho'),

('reagendamento_confirmado', 'reagendamento_confirmado', 'utility',
 'Certo, {{1}}! Seu horario na *{{2}}* passou para {{3}} as {{4}}, com {{5}}.',
 '["primeiro nome","barbearia","dia","hora HH:MM","barbeiro"]'::jsonb,
 '["Cancelar"]'::jsonb, 'rascunho'),

('cancelamento_confirmado', 'cancelamento_confirmado', 'utility',
 'Ok, {{1}}! Cancelei seu horario de {{2}} as {{3}} na *{{4}}*. Quando quiser marcar de novo, e so chamar.',
 '["primeiro nome","dia","hora HH:MM","barbearia"]'::jsonb,
 '["Quero remarcar"]'::jsonb, 'rascunho'),

('lembrete_recorrente', 'lembrete_recorrente', 'utility',
 'Oi, {{1}}! Seu horario fixo na *{{2}}* e {{3}} as {{4}}, com {{5}}. Mantem?',
 '["primeiro nome","barbearia","dia","hora HH:MM","barbeiro"]'::jsonb,
 '["Sim, confirmo","Reagendar","Cancelar"]'::jsonb, 'rascunho'),

('horario_cancelado_pela_barbearia', 'imprevisto_na_barbearia', 'utility',
 'Oi, {{1}}! Tivemos um imprevisto e precisamos cancelar seu horario de {{2}} as {{3}} na *{{4}}*. Desculpa pelo transtorno.',
 '["primeiro nome","dia","hora HH:MM","barbearia"]'::jsonb,
 '["Quero remarcar"]'::jsonb, 'rascunho'),

-- ---------- RECUPERACAO, familia UTILIDADE (o cliente pediu) ----------
-- Os corpos definitivos estao na 0080, que padroniza a abertura.
('retorno_pedido', 'retorno_pedido', 'utility',
 'Oi, {{1}}! Voce pediu pra gente avisar quando desse tempo de voltar na *{{2}}*. Ja faz {{3}}. Quer marcar?',
 '["primeiro nome","barbearia","tempo desde a ultima visita"]'::jsonb,
 '["Quero marcar","Agora nao"]'::jsonb, 'rascunho'),

('retorno_pedido_servico', 'retorno_pedido_servico', 'utility',
 'Oi, {{1}}! Voce pediu pra avisarmos quando fosse hora de repetir seu {{2}} na *{{3}}*. Deu o tempo. Quer marcar?',
 '["primeiro nome","servico","barbearia"]'::jsonb,
 '["Quero marcar","Agora nao"]'::jsonb, 'rascunho'),

('retorno_pedido_barbeiro', 'retorno_pedido_barbeiro', 'utility',
 'Oi, {{1}}! Voce pediu pra avisarmos quando desse tempo de voltar. O {{2}} tem horario livre essa semana na *{{3}}*. Quer marcar?',
 '["primeiro nome","barbeiro","barbearia"]'::jsonb,
 '["Quero marcar","Agora nao"]'::jsonb, 'rascunho'),

('retorno_recorrente', 'retorno_recorrente', 'utility',
 'Oi, {{1}}! Voce combinou de passar todo mes na *{{2}}*, e ja faz {{3}} desde a ultima vez. Quer marcar?',
 '["primeiro nome","barbearia","tempo desde a ultima visita"]'::jsonb,
 '["Quero marcar","Agora nao"]'::jsonb, 'rascunho'),

('retorno_intervalo', 'retorno_intervalo', 'utility',
 'Oi, {{1}}! Seu {{2}} foi ha {{3}}, que e mais ou menos o intervalo pra retocar. Quer marcar na *{{4}}*?',
 '["primeiro nome","servico","tempo desde a ultima visita","barbearia"]'::jsonb,
 '["Quero marcar","Agora nao"]'::jsonb, 'rascunho'),

-- Segue um agendamento real que o cliente perdeu, entao pedimos utilidade.
-- E o mais provavel de voltar recategorizado como marketing: a coluna
-- categoria_meta existe para registrar isso quando acontecer.
('retorno_faltou', 'retorno_faltou', 'utility',
 'Oi, {{1}}! Voce tinha horario na *{{2}}* em {{3}} e acabou nao dando pra vir. Quer remarcar?',
 '["primeiro nome","barbearia","dia que faltou"]'::jsonb,
 '["Quero remarcar","Agora nao"]'::jsonb, 'rascunho'),

-- ---------- RECUPERACAO, familia MARKETING (frio) ----------
('reativacao_convite', 'reativacao_convite', 'marketing',
 'Oi, {{1}}! Aqui e da *{{2}}*. Faz um tempinho que a gente nao te ve por aqui. Quer marcar um horario?',
 '["primeiro nome","barbearia"]'::jsonb,
 '["Quero marcar","Nao quero mais receber"]'::jsonb, 'rascunho'),

('reativacao_aniversario', 'reativacao_aniversario', 'marketing',
 'Oi, {{1}}! Aqui e da *{{2}}*. Passando so pra desejar feliz aniversario. Se quiser dar um trato no visual, e so chamar.',
 '["primeiro nome","barbearia"]'::jsonb,
 '["Quero marcar","Nao quero mais receber"]'::jsonb, 'rascunho'),

('reativacao_barbeiro', 'reativacao_barbeiro', 'marketing',
 'Oi, {{1}}! Aqui e da *{{2}}*. O {{3}} continua atendendo por aqui e tem horario livre. Quer marcar?',
 '["primeiro nome","barbearia","barbeiro"]'::jsonb,
 '["Quero marcar","Nao quero mais receber"]'::jsonb, 'rascunho'),

('reativacao_tempo', 'reativacao_tempo', 'marketing',
 'Oi, {{1}}! Ja faz {{2}} desde o seu ultimo corte na *{{3}}*. Quer marcar um horario?',
 '["primeiro nome","tempo desde a ultima visita","barbearia"]'::jsonb,
 '["Quero marcar","Nao quero mais receber"]'::jsonb, 'rascunho'),

('reativacao_horario_livre', 'reativacao_horario_livre', 'marketing',
 'Oi, {{1}}! Aqui e da *{{2}}*. Temos horario livre {{3}}, se quiser aproveitar pra dar um trato no cabelo.',
 '["primeiro nome","barbearia","quando (ex: essa semana)"]'::jsonb,
 '["Quero marcar","Nao quero mais receber"]'::jsonb, 'rascunho')

on conflict (chave) do nothing;
