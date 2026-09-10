-- 0147 — O opt-out de LGPD deixa de ser filtro sobre uma coluna que ninguem escreve.
--
-- `clients.recusou_contato` nasceu na 0076 e e LIDA por doze migrations (0113,
-- 0115, 0118, 0121, 0129, 0134...). Busca por qualquer ESCRITA dela em todo o
-- repositorio -- `.sql`, `.ts`, `.tsx` -- em 10/09/2026: **zero**. Nao havia RPC,
-- nao havia trigger, nao havia tela.
--
-- Ou seja: os templates de reativacao ja saem com o botao "Nao quero mais
-- receber" aprovado pela Meta, o cliente clica, e o clique caia num
-- `console.error` no `whatsapp-webhook`. Ele recebia de novo no ciclo seguinte,
-- e no seguinte. E `docs/marketing.md:195` afirmava que "o CRM so consegue
-- oferecer a saida manual (dono desmarcando na ficha)" -- uma tela que tambem
-- nao existia.
--
-- O lado da LEITURA sempre esteve pronto e correto. So faltava alguem escrever.

-- Casa pelos 8 ultimos digitos, que e como o projeto casa telefone em todo
-- lugar (`clients.telefone_norm` e coluna gerada com exatamente esta regra:
-- numero antigo sem o 9 nao bate com o formato novo; os 8 finais batem).
--
-- Marca em TODAS as barbearias onde aquele telefone e cliente, de proposito.
-- Quem clica esta falando com o numero CENTRAL da plataforma: do lado de la e
-- uma entidade so mandando mensagem, e ninguem sabe que existem varios
-- inquilinos aqui dentro. Em duvida sobre consentimento, o lado seguro e parar.
-- E nao custa nada que a pessoa queira: `recusou_contato` bloqueia REENGAJAMENTO
-- e nao bloqueia o lembrete do horario que ela mesma marcou -- servico que ela
-- contratou ao marcar (comentario da coluna, 0076).
create or replace function public.marcar_opt_out(p_telefone text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_norm text := nullif(right(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), 8), '');
  v_mexidas integer;
begin
  -- Telefone curto ou vazio casaria com gente demais. Melhor nao marcar nada.
  if v_norm is null or length(v_norm) < 8 then
    return 0;
  end if;

  update public.clients
     set recusou_contato = true
   where telefone_norm = v_norm
     and recusou_contato = false;
  get diagnostics v_mexidas = row_count;
  return v_mexidas;
end;
$function$;

comment on function public.marcar_opt_out(text) is
  'Registra o opt-out de reengajamento para um telefone, em todas as barbearias onde ele e cliente. Chamada pelo whatsapp-webhook quando a pessoa clica "Nao quero mais receber" ou escreve PARAR no numero central.';

-- So a edge com a service key. Nao e RPC de gestao: nao ha tenant a validar
-- (o telefone atravessa barbearias de proposito), entao expor a `authenticated`
-- daria a qualquer logado o poder de silenciar cliente de outra barbearia.
revoke all on function public.marcar_opt_out(text) from public, anon, authenticated;
grant execute on function public.marcar_opt_out(text) to service_role;

-- A ficha do cliente precisa MOSTRAR o opt-out, senao o dono liga para o cliente
-- que pediu para nao ser incomodado sem ter como saber. `docs/marketing.md:195`
-- ja afirmava que essa tela existia; nao existia.
--
-- Coluna nova no FIM da lista: `create or replace view` aceita acrescentar ao
-- final e preserva grants e dependentes. Trocar a ordem levantaria 42P16 -- ja
-- custou quatro tentativas neste projeto. `security_invoker` vem junto porque
-- `replace` NAO preserva reloptions.
create or replace view public.clientes_com_ultima_visita
with (security_invoker = on) as
 select c.id,
    c.salon_id,
    c.nome,
    c.telefone,
    c.aniversario,
    c.observacao,
    c.created_at,
    ( select max(a.data_hora_inicio) as max
        from appointments a
       where a.client_id = c.id and a.status = 'concluido'::text) as ultima_visita,
    c.recusou_contato
   from clients c;
