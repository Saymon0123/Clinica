-- Convite de dono: cadastrar barbearia sem estar frente a frente.
--
-- O cadastro de hoje (`admin-create-salon`) só funciona com as duas pessoas
-- juntas: alguém precisa saber endereço, telefone, horário dos sete dias,
-- catálogo com preço e duração, e digitar tudo. Por WhatsApp isso vira uma
-- entrevista de dias, e o interesse esfria no meio.
--
-- A saída reaproveita a máquina que já existe para convidar barbeiro:
-- `salon_invites` + `accept-invite` + a tela `/convite/:token`. O que muda é
-- que o convidado entra como **dono** de uma barbearia que já nasce criada,
-- com horário e catálogo padrão, e ajusta o que não serve depois.
--
-- Três ajustes na tabela, e o terceiro é o que faz a ideia valer.

-- 1. O papel `owner` não era aceito.
alter table public.salon_invites drop constraint if exists salon_invites_role_check;
alter table public.salon_invites
  add constraint salon_invites_role_check
  check (role in ('owner', 'gerente', 'barbeiro'));

-- 2. O nome deixa de ser obrigatório na criação do convite.
--
-- Quem convida barbeiro é o dono, que sabe o nome dele. Quem convida dono é o
-- vendedor, no meio de uma conversa de WhatsApp — e o nome que ele teria para
-- digitar é o do contato salvo, que costuma ser apelido ou nome de empresa. O
-- mesmo motivo pelo qual o agente nunca supõe o nome do cliente.
--
-- Nulo aqui significa "pergunte a quem aceitar".
alter table public.salon_invites alter column nome drop not null;

comment on column public.salon_invites.nome is
  'Nome de quem foi convidado. Nulo no convite de dono: quem aceita digita o proprio nome.';

-- 3. Quantos dias de teste, contados a partir do ACEITE.
--
-- Este é o ponto que decide se a ideia funciona. Se o relógio começasse na
-- criação do convite, o dono que abrisse o link três dias depois testaria por
-- quatro; abrindo no décimo dia, encontraria o CRM já bloqueado e teria como
-- primeira impressão do produto uma tela de acesso vencido.
--
-- Por isso a assinatura nasce com `acesso_ate` NULO — o `salons_atendendo`
-- já trata nulo como "não atende", o que está certo: ninguém usa ainda — e a
-- data é gravada por `accept-invite`, no primeiro acesso.
alter table public.salon_invites
  add column if not exists dias_de_teste integer;

comment on column public.salon_invites.dias_de_teste is
  'Dias de teste a conceder QUANDO o convite for aceito. O relogio comeca no primeiro acesso, nao na criacao do convite. Nulo = sem prazo (barbearia que ja esta pagando).';

-- 4. O dono atende como barbeiro?
--
-- Ser dono (acesso, em `user_salons`) e atender clientes (recurso agendável,
-- em `professionals`) são coisas diferentes. Criar o dono como barbeiro sempre
-- faria o agente oferecê-lo ao cliente no WhatsApp — foi o defeito que o
-- `donoAtende` do wizard existe para evitar, e ele não pode voltar por aqui.
alter table public.salon_invites
  add column if not exists dono_atende boolean not null default true;

comment on column public.salon_invites.dono_atende is
  'Se o dono convidado tambem atende. Falso cria apenas o vinculo de acesso, sem ficha em professionals -- senao o agente passa a oferece-lo como barbeiro no WhatsApp.';
