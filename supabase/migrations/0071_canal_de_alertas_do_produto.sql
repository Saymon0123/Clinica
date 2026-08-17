-- Por onde o dono do produto recebe alertas internos.
--
-- Ate aqui a auditoria e o feedback saiam pela instancia de WhatsApp da
-- **Curitiba**, com o nome fixo dentro do no do n8n. Tres problemas, e o
-- primeiro e o que decide:
--
-- 1. Se a Curitiba cancelar, trocar de numero ou o WhatsApp dela cair, os
--    alertas param **em silencio** -- justamente quando mais seriam
--    necessarios.
-- 2. A conta comercial de uma cliente estava sendo usada para falar do negocio
--    de outra pessoa, sem que ela soubesse.
-- 3. E circular: a auditoria que avisaria que o WhatsApp caiu depende do
--    WhatsApp que caiu.
--
-- Uma linha so, porque e um canal so. Trocar de instancia passa a ser um update
-- aqui, nao uma edicao em cada fluxo -- que e como um deles ficaria para tras.
--
-- Comeca apontando para onde ja apontava, de proposito: assim a troca nao
-- quebra nada, e ligar a instancia propria vira um update de duas colunas.

create table if not exists public.canal_de_alertas (
  id boolean primary key default true,
  instance_name text not null,
  destino text not null,
  atualizado_em timestamptz not null default now(),
  -- Garante linha unica: sem isso, dois canais e ninguem sabe qual vale.
  constraint canal_unico check (id)
);

alter table public.canal_de_alertas enable row level security;

comment on table public.canal_de_alertas is
  'Instancia de WhatsApp e numero por onde o dono do PRODUTO recebe auditoria e feedback. Linha unica. Sem policy de proposito: so o service_role (n8n) le.';

insert into public.canal_de_alertas (id, instance_name, destino)
values (true, 'salon-c6f6a297-00b7-4687-b9d3-4f7154cc800f', '5541984729754')
on conflict (id) do nothing;
