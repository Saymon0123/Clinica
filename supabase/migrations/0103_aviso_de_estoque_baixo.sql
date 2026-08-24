-- Estoque baixo avisa o dono, em vez de esperar ser visto (2026-08-25).
--
-- O badge "baixo" no Catalogo so existe para quem abre o Catalogo -- e
-- barbeiro corta cabelo, nao abre catalogo. O n8n passa a mandar por e-mail:
-- "Pomada modeladora: restam 2 (minimo 5)". O dono nao faz nada; o aviso vai
-- ate ele.
--
-- Anti-spam: `estoque_baixo_avisado_em` marca que o aviso daquele "mergulho"
-- ja saiu. Quando a reposicao leva o estoque acima do minimo, o trigger limpa
-- a marca -- o proximo mergulho avisa de novo. Um produto parado abaixo do
-- minimo gera UM e-mail, nao um por dia.

alter table public.products
  add column if not exists estoque_baixo_avisado_em timestamptz;

comment on column public.products.estoque_baixo_avisado_em is
  'Quando o e-mail de estoque baixo saiu para o dono. Limpo por trigger quando o estoque volta acima do minimo, para o proximo mergulho avisar de novo.';

create or replace function public.limpa_aviso_de_estoque()
returns trigger
language plpgsql
as $$
begin
  if new.estoque_atual > new.estoque_minimo then
    new.estoque_baixo_avisado_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limpa_aviso_de_estoque on public.products;
create trigger trg_limpa_aviso_de_estoque
  before update of estoque_atual, estoque_minimo on public.products
  for each row execute function public.limpa_aviso_de_estoque();

-- A fila do n8n: produtos ativos, abaixo do minimo, ainda nao avisados.
-- So service_role: carrega o e-mail do dono (email_do_dono e definer).
create view public.produtos_com_estoque_baixo
with (security_invoker = on) as
select p.id, p.nome, p.estoque_atual, p.estoque_minimo,
       s.id as salon_id, s.nome as barbearia,
       public.email_do_dono(s.id) as email_do_dono
  from public.products p
  join public.salons s on s.id = p.salon_id
 where p.ativo
   and p.estoque_minimo > 0
   and p.estoque_atual <= p.estoque_minimo
   and p.estoque_baixo_avisado_em is null;

revoke all on public.produtos_com_estoque_baixo from anon, authenticated;
grant select on public.produtos_com_estoque_baixo to service_role;
