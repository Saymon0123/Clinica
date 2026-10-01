-- O template da vaga que você pediu.
--
-- O aviso "abriu uma vaga" é **plataforma iniciando** conversa, então fora da
-- janela de 24h ele só sai por template aprovado. Este nasce `rascunho` e
-- `ativo = false`: submeter à Meta é ação do dono no WhatsApp Manager, e nada
-- pode tentar enviá-lo antes da aprovação.
--
-- ## Por que ele deve sair como `utility`, e o que isso tem a ver com a forma
--
-- A regra permanente da casa (12/09): **a Meta classifica por intenção, não pelo
-- que se pede.** O cliente ter pedido para ser avisado não decide nada — ajuda,
-- mas não decide. Quem decide é a frase.
--
-- Os oito templates que a Meta devolveu como `utility` têm todos a mesma forma:
-- fato concreto (dia, hora, barbeiro) e pergunta de confirmação. Os três que nós
-- mesmos classificamos como `marketing` — e por isso nunca submetemos — têm a
-- forma oposta: vago ("faz um tempinho que a gente não te vê") e convite aberto
-- ("Quer marcar um horário?"), com botão de opt-out.
--
-- O molde deste aqui é o `horario_reservado` (chave `reativacao_horario_livre`),
-- **aprovado como utility**, cujo corpo é quase esta mensagem:
--
--     Oi, {{1}}! Abriu um horário na *{{2}}* que costuma combinar com você:
--     {{3}} às {{4}}, com {{5}}. Confirma?
--
-- Três escolhas de redação herdadas dele, cada uma empurrando para `utility`:
--
-- 1. **"o horário que você pediu"** — não "um horário". A mensagem responde a um
--    pedido específico e nomeado, que é a definição de utilidade.
-- 2. **O prazo da reserva no corpo.** "Fica reservado para você por 30 minutos"
--    é informação de transação em curso, não isca. De quebra é verdade: a 0192
--    segura a vaga de fato.
-- 3. **Termina em "Confirma?"**, como os oito aprovados — e não em "Quer
--    marcar?", como os três que recuamos de enviar.
--
-- Os botões também seguem o lado aprovado: nenhum é opt-out de marketing. "Sair
-- da espera" é ação sobre **este pedido**, não descadastro de divulgação.
--
-- ## O nome que a Meta lê também conta
--
-- `reativacao_horario_livre` foi submetido como **`horario_reservado`**, e
-- `reativacao` como `agendamento_sugerido`: quem escreveu tirou a palavra
-- "reativação" do nome de propósito. Por isso aqui o `nome_meta` é
-- `vaga_que_voce_pediu`, e não `fila_de_espera_aviso`.
--
-- ## E quando o template não é preciso
--
-- Se a vaga abrir **dentro de 24h** da última mensagem do cliente — o caso mais
-- comum, porque ele acabou de pedir —, a resposta cabe na janela de atendimento
-- e sai como texto livre pela Evolution, sem template e sem tarifa de template.
-- Este template é para a vaga que abre depois.
--
-- ## Se a Meta discordar, nós saberemos
--
-- A view `templates_recategorizados` compara o que pedimos com o que a Meta
-- devolveu. Se este voltar como `marketing`, ela acusa — e aí a saída é mexer na
-- frase, não aceitar a tarifa, que é perto de 9x.

insert into public.whatsapp_templates
  (chave, nome_meta, idioma, categoria, corpo, parametros, botoes, status, ativo)
values (
  'fila_vaga_abriu',
  'vaga_que_voce_pediu',
  'pt_BR',
  'utility',
  'Oi, {{1}}! Abriu o horário que você pediu na *{{2}}*: {{3}} às {{4}}, com {{5}}. Fica reservado para você por {{6}}. Confirma?',
  -- `jsonb`, não `text[]`: é o tipo das duas colunas.
  jsonb_build_array('primeiro nome', 'barbearia', 'dia', 'hora HH:MM', 'barbeiro',
                    'prazo da reserva (ex.: 30 minutos)'),
  jsonb_build_array('Sim', 'Esse nao serve', 'Sair da espera'),
  'rascunho',
  false
);

comment on table public.whatsapp_templates is
  'Catalogo dos templates da Cloud API. `categoria` e o que PEDIMOS; `categoria_meta` e o que a Meta devolveu, e a view templates_recategorizados acusa quando discordam. Regra permanente de 12/09: buscar sempre utility, porque marketing custa perto de 9x -- e a Meta classifica pela forma da frase, nao pelo que se pede. O molde que ela aprova: fato concreto (dia, hora, barbeiro) e pergunta de confirmacao.';
