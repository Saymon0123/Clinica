-- A categoria que pedimos nao e necessariamente a que a Meta deu.
--
-- Desde 2025-04-09 a Meta nao reprova mais divergencia de categoria: se voce
-- pede `utility` e ela entende que e `marketing`, o template e **aprovado como
-- marketing**. Voce so descobre pela fatura -- e a diferenca e de quase dez
-- vezes.
--
-- Pior: ela **recategoriza templates ja aprovados** ao longo do tempo. Um
-- lembrete que hoje custa R$ 0,04 pode passar a custar R$ 0,35 sem ninguem
-- mexer em nada.
--
-- Guardar as duas colunas separadas e o que permite descobrir isso olhando o
-- banco, em vez de olhando a conta no fim do mes.

alter table public.whatsapp_templates
  add column if not exists categoria_meta text
    check (categoria_meta in ('utility', 'marketing', 'authentication'));

comment on column public.whatsapp_templates.categoria is
  'A categoria que PEDIMOS ao cadastrar. Ver categoria_meta para a que valeu.';

comment on column public.whatsapp_templates.categoria_meta is
  'A categoria que a META de fato aplicou, copiada do painel. Nulo enquanto nao aprovado. Diferente de `categoria` significa que fomos recategorizados -- quase sempre de utility para marketing, o que multiplica o custo por nove.';

-- Fica visivel sem precisar lembrar de conferir.
create or replace view public.templates_recategorizados
with (security_invoker = on) as
select chave, nome_meta, categoria as pedimos, categoria_meta as a_meta_deu, status, atualizado_em
  from public.whatsapp_templates
 where categoria_meta is not null
   and categoria_meta is distinct from categoria;

comment on view public.templates_recategorizados is
  'Templates em que a Meta discordou da categoria que pedimos. Linha aqui significa custo diferente do previsto -- provavelmente nove vezes maior.';
