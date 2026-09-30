-- 0179: o catálogo de recursos não é público (achado na auditoria de RLS).
--
-- A policy chamava-se "recursos: leitura para autenticados" e não restringia
-- papel nenhum: `for select using (true)`, sem cláusula `to`, herda `public` —
-- que inclui `anon`. O nome dizia uma coisa e o banco fazia outra.
--
-- O QUE VAZAVA, HONESTAMENTE: nada de cliente. `recursos` é o catálogo global
-- de funcionalidades (chave, nome, descrição, padrão). Quem tivesse a chave
-- anônima liaria os nomes das features. Isso é higiene, não incidente.
--
-- POR QUE É SEGURO APERTAR. O único leitor é `useRecurso`, pela view
-- `recursos_ativos`, e ele sai antes da consulta quando não há `salonId`. A
-- view já é `security_invoker = on` e passa por `salons`, cuja policy exige
-- ser membro — então o anônimo nunca tirou linha dali de qualquer forma. As
-- telas de fato anônimas (agenda pública) não leem tabela: vão por RPC.
--
-- O papel vai declarado. `alter policy` não muda papel; tem que recriar.

drop policy if exists "recursos: leitura para autenticados" on public.recursos;

create policy "recursos: catalogo para autenticados"
  on public.recursos for select to authenticated
  using (true);

comment on table public.recursos is
  'Catalogo global de funcionalidades que podem ser ligadas por barbearia, com '
  'o padrao global de cada uma. Sem coluna de dono de proposito: nao ha dado de '
  'cliente aqui, so o nome das features. Leitura liberada para qualquer '
  'autenticado; o estado por barbearia mora em recursos_do_salao.';
