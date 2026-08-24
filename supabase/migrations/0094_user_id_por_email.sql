-- De quem e este e-mail?
--
-- Existe porque o accept-invite verificava com `listUsers()` sem paginacao:
-- funciona com 5 contas e quebra silenciosamente a partir de 50 -- o e-mail
-- existente deixa de ser encontrado e o fluxo tenta criar a conta de novo,
-- estourando erro cru na cara de quem aceitou o convite.
--
-- Consulta direta por indice, sem lista, sem pagina. Devolve NULO quando nao
-- ha conta -- nunca um palpite. Mesmo padrao de salon_por_phone_number_id.
create or replace function public.user_id_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;
$$;

-- So o service_role (edge functions) pergunta. Expor a authenticated deixaria
-- qualquer conta logada descobrir quais e-mails tem cadastro.
revoke execute on function public.user_id_por_email(text) from anon, authenticated;

comment on function public.user_id_por_email(text) is
  'Traduz e-mail para user_id do auth. Devolve NULO quando nao existe. So para service_role: expor isso a usuarios logados viraria um oraculo de quais e-mails tem conta.';
