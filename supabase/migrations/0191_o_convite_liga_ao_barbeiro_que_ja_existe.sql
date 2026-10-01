-- O convite que LIGA ao barbeiro que já está na agenda.
--
-- ## O defeito
--
-- `accept-invite` fazia **`insert`** em `professionals`, sempre. Barbeiro que já
-- ocupa cadeira sem login — caso de uso real e comum: ele atende, aparece na
-- agenda, é oferecido pelo agente no WhatsApp, e nunca abre o CRM — ao receber
-- acesso virava **um segundo profissional**. O dono ficava com dois "João": o
-- antigo com todo o histórico, comissão e horários, e o novo vazio com o login.
--
-- Descoberto em 30/09 ao consertar o item 6 (o seletor de promover que sumia).
-- Foi por isso que o texto do seletor desabilitado não manda convidar: mandar
-- convidar era mandar o dono direto para a duplicata.
--
-- ## A régua: escolha explícita do dono, não adivinhação
--
-- Quem sabe se o "João" da agenda é o mesmo do `joao@gmail.com` é o **dono**, e
-- ele já está olhando a lista quando cria o convite. Por isso a ligação é um
-- campo do convite, e não um casamento automático:
--
-- - **Por nome** erra com dois Joões e com grafia diferente.
-- - **Por telefone** parece firme, mas nem todo profissional tem telefone, e
--   número reaproveitado ligaria a pessoa errada.
--
-- E **ligação errada é pior que duplicata**: ela entrega o histórico, a comissão
-- e a agenda de alguém para outra pessoa. Duplicata o dono vê e conserta;
-- ligação errada ele não vê.
--
-- ## Por que a FK é COMPOSTA
--
-- `(professional_id, salon_id)` referenciando `(id, salon_id)` torna
-- **estruturalmente impossível** um convite apontar para a cadeira de outra
-- barbearia. Validar isso só na edge function deixaria a régua fora do banco,
-- que é onde ela mora neste projeto.
--
-- O `set null` precisa do recorte `(professional_id)`: sem ele o Postgres
-- tentaria anular as DUAS colunas da FK, e `salon_id` é `not null` — o delete
-- falharia. Recorte de coluna no `on delete set null` existe desde o PG 15; o
-- banco aqui é 17.6, conferido.

-- A FK composta precisa de um unique para apontar. `id` já é PK, então este
-- unique nunca recusa nada: ele existe só para dar alvo à referência.
alter table public.professionals
  add constraint professionals_id_salon_unico unique (id, salon_id);

alter table public.salon_invites
  add column professional_id uuid;

alter table public.salon_invites
  add constraint salon_invites_profissional_da_mesma_barbearia
  foreign key (professional_id, salon_id)
  references public.professionals (id, salon_id)
  on delete set null (professional_id);

-- Dois convites EM ABERTO não disputam a mesma cadeira. Sem isto, o dono
-- convidaria duas pessoas para o mesmo "João" e a segunda a aceitar encontraria
-- a cadeira já tomada — ou, pior, tomaria a cadeira da primeira. O convite já
-- USADO sai do índice de propósito: a cadeira pode ser religada depois de quem
-- a ocupava sair da equipe.
create unique index salon_invites_profissional_em_aberto_unico
  on public.salon_invites (professional_id)
  where professional_id is not null and usado_em is null;

-- O trinco. Nesta tabela o **SELECT é de tabela** e o **INSERT é por coluna**:
-- `authenticated` pode inserir exatamente `salon_id, nome, email, role,
-- comissao_percentual`, e nada mais. Coluna nova não herda grant por coluna, e
-- a tela manda um `insert` só com a lista de campos — sem esta linha, criar
-- convite passaria a falhar INTEIRO com 42501, do mesmo jeito que Configurações
-- falhou em 30/09. É a quarta armadilha do CLAUDE.md, agora nesta tabela.
grant insert (professional_id) on public.salon_invites to authenticated;

-- Não há `grant select` aqui porque não faria nada: o SELECT desta tabela é de
-- tabela, então a coluna nova já nasce legível por quem a RLS deixa passar. E
-- quem a RLS deixa passar é só gestor da própria barbearia: a única policy
-- PERMISSIVE exige `is_manager(salon_id)`, e a outra é RESTRICTIVE — ela não
-- concede nada, só proíbe `role = 'owner'` na escrita. Conferido com `set role
-- anon`: zero linha.

comment on column public.salon_invites.professional_id is
  'Barbeiro que JA existe na agenda sem login, escolhido pelo dono ao criar o convite. Ao aceitar, `accept-invite` LIGA este profissional ao login novo em vez de inserir outro -- sem isto o dono ficava com dois barbeiros de mesmo nome. Nulo = pessoa nova, insere profissional como antes.';
