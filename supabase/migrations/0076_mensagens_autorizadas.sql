-- Parte 1 da migracao para a API oficial: o registro das mensagens autorizadas.
--
-- Na Cloud API, tudo que o sistema envia SEM o cliente ter falado primeiro
-- precisa ser um template cadastrado e aprovado pela Meta. Isso atinge lembrete,
-- atraso, reativacao e aviso de vencimento -- ou seja, quase tudo que o produto
-- faz sozinho.
--
-- Hoje o texto e montado em SQL e sai livre pela Evolution. Depois, o SQL deixa
-- de produzir a frase e passa a produzir **qual template usar e com que
-- parametros**. Este arquivo cria o lugar onde esses templates moram.
--
-- **Nada pode ser enviado com status diferente de 'aprovado'.** E a trava
-- central: template reprovado ou ainda em analise que escapa vira erro na Meta
-- e, repetido, vira nota de qualidade ruim no numero -- o que estrangula os
-- lembretes, que sao o que de fato funciona.

create table if not exists public.whatsapp_templates (
  chave text primary key,
  -- Nome exato como cadastrado na Meta. Separado da chave porque o nome la tem
  -- regras proprias (minusculo, sem acento) e pode mudar sem que o codigo mude.
  nome_meta text not null,
  idioma text not null default 'pt_BR',
  categoria text not null check (categoria in ('utility', 'marketing', 'authentication')),
  -- O corpo com {{1}}, {{2}}... Guardado para conferencia e para o dono ver o
  -- que sera enviado. Quem manda de verdade e a Meta, pelo nome.
  corpo text not null,
  -- O que e cada {{n}}, na ordem. Sem isto, quem montar a chamada precisa
  -- adivinhar a ordem -- e errar a ordem manda o nome do barbeiro no lugar da
  -- hora, na frente do cliente.
  parametros jsonb not null default '[]'::jsonb,
  botoes jsonb not null default '[]'::jsonb,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'em_analise', 'aprovado', 'reprovado', 'pausado')),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

alter table public.whatsapp_templates enable row level security;

comment on table public.whatsapp_templates is
  'Mensagens que o sistema pode enviar sem o cliente ter falado primeiro. So as de status aprovado podem sair. Sem policy: leitura pelo service_role (n8n) e manutencao pelo dono do produto.';

comment on column public.whatsapp_templates.categoria is
  'utility = segue uma acao que o cliente ja tomou (~R$ 0,04). marketing = reengajamento ou promocao (~R$ 0,35, quase dez vezes mais). A Meta classifica por INTENCAO, nao por conteudo: "faz tempo que voce nao vem" e marketing mesmo sem desconto nenhum.';

insert into public.whatsapp_templates (chave, nome_meta, categoria, corpo, parametros, botoes, status) values
(
  'lembrete_confirmacao',
  'lembrete_agendamento',
  'utility',
  'Oi, {{1}}! Passando pra lembrar do seu horario na *{{2}}*: {{3}} as {{4}} com {{5}}.',
  '["primeiro nome do cliente","nome da barbearia","dia (hoje/amanha/dd/mm)","hora local HH:MM","nome do barbeiro"]'::jsonb,
  '["Sim, confirmo","Reagendar","Cancelar"]'::jsonb,
  'rascunho'
),
(
  'atraso_esta_vindo',
  'cliente_atrasado',
  'utility',
  'Oi, {{1}}! Aqui e da *{{2}}*. Seu horario era {{3}} e a cadeira esta te esperando. Consegue chegar nos proximos minutos?',
  '["primeiro nome do cliente","nome da barbearia","hora marcada HH:MM"]'::jsonb,
  '["Estou chegando","Nao vou poder ir"]'::jsonb,
  'rascunho'
),
(
  'reativacao',
  'sentimos_sua_falta',
  'marketing',
  'Oi, {{1}}! Faz {{2}} que voce nao passa aqui na *{{3}}*. Bora marcar um horario?',
  '["primeiro nome do cliente","tempo desde a ultima visita (ex: 3 meses)","nome da barbearia"]'::jsonb,
  '["Quero marcar"]'::jsonb,
  'rascunho'
),
(
  'fim_de_teste',
  'fim_do_teste_gratis',
  'utility',
  'Oi! O teste gratis do Club Cut na *{{1}}* acaba {{2}}. Pra continuar com a agenda e o atendimento automatico, e so assinar dentro do sistema.',
  '["nome da barbearia","quando acaba (hoje / em 3 dias)"]'::jsonb,
  '[]'::jsonb,
  'rascunho'
)
on conflict (chave) do nothing;

-- Opt-out. Marketing sem saida e problema de LGPD antes de ser problema de
-- qualidade na Meta -- e reativacao e marketing.
alter table public.clients
  add column if not exists recusou_contato boolean not null default false;

comment on column public.clients.recusou_contato is
  'Cliente pediu para nao receber mensagem de reengajamento. Bloqueia reativacao; NAO bloqueia lembrete do proprio horario, que e servico que ele contratou ao marcar.';
