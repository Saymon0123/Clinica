-- 0128: uma régua só para o telefone do cliente, e convite que troca de dono
-- troca de link (roteiro de consertos, passo 1.9 — achados 10 e 12).
--
-- =========================================================================
-- PARTE A — o telefone do cliente
-- =========================================================================
--
-- Hoje o campo aceita qualquer coisa. Na base de teste há seis clientes com
-- teclado batido no lugar do número ("lkasdnfoabi", "Nãos si"). O dano não é
-- estético:
--
--   * `telefone_norm` (0009) são os últimos 8 dígitos; texto sem dígito vira
--     NULO, e cliente com norm nulo escapa do índice único, é invisível para
--     todo casamento com o WhatsApp e nunca entra em lembrete, reativação nem
--     avaliação. Ele existe na lista e não existe para a automação.
--   * Um número CURTO é pior que um inválido: '9999' produz norm '9999', que
--     casa por sufixo com qualquer telefone terminado assim — resposta de
--     WhatsApp de um cliente pode cair no cadastro de outro.
--
-- A regra 10–13 dígitos não é nova: `garantir_cliente` (0124) já a aplica
-- desde 01/09, mas só no caminho da Agenda. Aqui ela vira trava do banco,
-- valendo para o balcão, a importação de CSV, a agenda pública e o agente.
--
-- **Uma cópia só.** A revisão deste passo apontou que a faixa ia acabar
-- existindo em quatro lugares (a RPC, a CHECK, o TypeScript do CRM e o link
-- do WhatsApp). Por isso ela nasce como função e a CHECK e a RPC passam a
-- chamá-la. O TypeScript espelha em `src/lib/telefone.ts`, com teste que
-- documenta os mesmos limites — é o mais perto de fonte única que dá para
-- chegar entre navegador e banco.

create or replace function private.telefone_valido(p_telefone text)
returns boolean
language sql
immutable
as $$
  select length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) between 10 and 13;
$$;

comment on function private.telefone_valido(text) is
  'Regra unica do telefone que a plataforma consegue usar: de 10 (fixo com DDD) a 13 digitos (DDI 55 + DDD + 9 digitos), ignorando mascara. NAO e definer e nao le dado nenhum -- e so a regua. Usada pela CHECK de clients.telefone e por garantir_cliente.';

-- Limpar antes de trancar. O valor antigo NÃO é jogado fora: vai para a
-- observação do cliente, que é onde o dono vai procurar. Apagar em silêncio o
-- que alguém digitou é o tipo de coisa que só se descobre quando faz falta.
update public.clients
   set observacao = nullif(
         btrim(coalesce(observacao || E'\n', '') ||
               'Telefone que estava no cadastro e não era um número: ' || telefone),
         ''),
       telefone = null
 where telefone is not null
   and not private.telefone_valido(telefone);

-- Validada, não `NOT VALID`. A tentação era entrar sem validar para não mexer
-- em linha antiga — mas CHECK vale para UPDATE de linha preexistente também, e
-- o fechamento de comanda (`NewSaleModal`) grava preferência de aviso na
-- `clients` a cada venda, engolindo o erro num console.error. Com `NOT VALID`,
-- fechar a comanda desses clientes deixaria de gravar o opt-in de aviso sem
-- ninguém ver. Ou limpa e valida, ou não faz.
alter table public.clients drop constraint if exists clients_telefone_valido;
alter table public.clients
  add constraint clients_telefone_valido
  check (telefone is null or private.telefone_valido(telefone));

comment on constraint clients_telefone_valido on public.clients is
  'Telefone em branco e permitido (cliente sem WhatsApp existe). Preenchido, tem de ter de 10 a 13 digitos -- senao telefone_norm fica nulo e o cliente some da automacao, ou fica curto e casa com o cliente errado.';

-- A RPC passa a chamar a mesma régua, em vez de repetir a faixa inline.
create or replace function public.garantir_cliente(p_salon_id uuid, p_nome text, p_telefone text)
returns table(id uuid, nome text, ja_existia boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_digitos text;
  v_norm text;
  v_existente public.clients%rowtype;
  v_novo_id uuid;
begin
  if p_salon_id not in (select private.salon_ids()) then
    raise exception 'Barbearia nao encontrada.' using errcode = '42501';
  end if;

  if not private.telefone_valido(p_telefone) then
    raise exception 'Telefone inválido: informe DDD e número.' using errcode = '22023';
  end if;

  v_digitos := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_norm := right(v_digitos, 8);

  select * into v_existente
    from public.clients c
   where c.salon_id = p_salon_id and c.telefone_norm = v_norm
   limit 1;

  if found then
    return query select v_existente.id, v_existente.nome, true;
    return;
  end if;

  insert into public.clients (salon_id, nome, telefone, created_by)
  values (p_salon_id, coalesce(nullif(btrim(p_nome), ''), 'Cliente'), p_telefone, (select auth.uid()))
  returning clients.id into v_novo_id;

  return query select v_novo_id, coalesce(nullif(btrim(p_nome), ''), 'Cliente'), false;
end;
$function$;

-- =========================================================================
-- PARTE B — trocar o e-mail do convite troca o link
-- =========================================================================
--
-- Hoje a tela faz `update salon_invites set email = ...` e nada mais. Três
-- defeitos de uma vez:
--
--   1. **O link antigo continua vivo.** Quem recebeu o convite no endereço
--      errado ainda consegue abri-lo — e `accept-invite`, quando o e-mail novo
--      ainda não tem conta Club Cut, cria a conta com o e-mail do convite e a
--      senha de QUEM ABRIU. O destinatário errado vira o barbeiro. (Se o
--      e-mail novo já tiver conta, o outro ramo exige a senha atual e barra;
--      mas isso é sorte, não trava.)
--   2. **O prazo não reinicia.** Trocar o endereço no sexto dia entrega ao
--      convidado certo um link que morre amanhã.
--   3. **O e-mail novo nunca sai.** A fila do n8n é a view `convites_a_enviar`
--      (0104), que filtra `email_enviado_em is null`. Convite que já saiu uma
--      vez tem a coluna preenchida e não volta para a fila — a tela diz
--      "salvo" e nada é enviado.
--
-- As quatro escritas têm de andar juntas, e por isso viram RPC. Mesmo motivo
-- da 0122: a policy "salon_invites: gestor gerencia" autoriza a LINHA, nunca a
-- COLUNA — sem o revoke abaixo, o caminho antigo continua aberto pela API e
-- um gestor pode escrever `token`, `usado_em` e `expira_em` à mão.
--
-- Endereço IGUAL é reenvio, não troca: o destinatário é o mesmo, então o link
-- que já foi mandado por WhatsApp continua valendo; renova só o prazo e a
-- fila. O token morre exatamente quando o destinatário muda, que é a razão de
-- segurança de tudo isto.
create or replace function public.trocar_email_do_convite(p_convite_id uuid, p_email text)
returns table (novo_token text, novo_prazo timestamptz, trocou boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_convite public.salon_invites%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select * into v_convite from public.salon_invites where id = p_convite_id;
  if not found then
    raise exception 'Convite não encontrado.' using errcode = '22023';
  end if;

  -- Definer ignora RLS: a autorização tem de estar escrita aqui dentro, e tem
  -- de ser a policy INTEIRA. Os dois termos não são redundantes:
  -- `salon_ids()` faz join com `salons` e exige `ativo`, `is_manager()` só lê
  -- `user_salons`. Com apenas o segundo, o gestor de uma barbearia que a
  -- operação DESLIGOU continuaria girando token de convite — e desligar é o
  -- botão que deveria cortar o acesso de todo mundo dela na hora (0016).
  if v_convite.salon_id not in (select private.salon_ids())
     or not private.is_manager(v_convite.salon_id) then
    raise exception 'Você não gerencia esta barbearia.' using errcode = '42501';
  end if;

  if v_convite.usado_em is not null then
    raise exception 'Este convite já foi aceito.' using errcode = '22023';
  end if;

  -- Convite de dono nasce na operação (`admin-invite-salon`), com prazo e dias
  -- de teste próprios. Recusar explicitamente evita um "não encontrado"
  -- incompreensível daqui a seis meses.
  if v_convite.role = 'owner' then
    raise exception 'Convite de dono é trocado pela operação, não pela barbearia.' using errcode = '42501';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  if v_email = v_convite.email then
    -- Reenvio: mesmo destinatário, mesmo link. Renova prazo e volta para a fila.
    update public.salon_invites i
       set expira_em = now() + interval '7 days',
           email_enviado_em = null
     where i.id = p_convite_id
     returning i.token, i.expira_em into novo_token, novo_prazo;
    trocou := false;
  else
    -- Destinatário novo: token novo. O antigo deixa de resolver qualquer
    -- linha, e `accept-invite` já responde 404 com "Peça um link novo ao dono"
    -- — não precisa de coluna de token revogado.
    --
    -- Efeito colateral consciente: o freio de força bruta de senha do
    -- `accept-invite` é chaveado por token, então o contador zera. Está certo,
    -- é outro destinatário.
    -- `extensions.` na frente de propósito: pgcrypto mora lá, e o
    -- `search_path` travado desta função (exigência de toda definer aqui) não
    -- alcança o schema. Sem o prefixo, a troca morre com 42883 — o default da
    -- coluna em 0017 funciona só porque o insert vem com outro search_path.
    update public.salon_invites i
       set email = v_email,
           token = encode(extensions.gen_random_bytes(24), 'hex'),
           expira_em = now() + interval '7 days',
           email_enviado_em = null
     where i.id = p_convite_id
     returning i.token, i.expira_em into novo_token, novo_prazo;
    trocou := true;
  end if;

  return next;
end;
$function$;

comment on function public.trocar_email_do_convite(uuid, text) is
  'Troca o destinatario de um convite pendente: e-mail novo, token novo, prazo novo e volta para a fila de e-mail do n8n. Endereco igual e reenvio (renova prazo e fila, mantem o token). Devolve trocou=true quando o link anterior morreu.';

revoke all on function public.trocar_email_do_convite(uuid, text) from public, anon;
grant execute on function public.trocar_email_do_convite(uuid, text) to authenticated;

-- Sem isto a RPC é enfeite: o caminho antigo continua aberto pela API. O CRM
-- não precisa de UPDATE nenhum em convite — cria por insert, cancela por
-- delete, troca o e-mail por esta RPC.
revoke update on public.salon_invites from authenticated, anon;

-- E fechar só o UPDATE seria meio conserto. O INSERT estava igualmente solto:
-- a policy "gestor gerencia" (0017) autoriza a LINHA e vale para GERENTE, o
-- 0023 deu `grant all` a `authenticated`, e a 0050 passou a aceitar
-- `role = 'owner'` na tabela. O caminho existia e foi reproduzido: um gerente
-- fazia POST em /rest/v1/salon_invites com role='owner', lia o token de volta
-- no próprio insert, abria o link com um e-mail sem conta e virava DONO da
-- barbearia — porque `accept-invite` roda com service_role e grava
-- `user_salons.role = convite.role` sem perguntar.
--
-- Duas travas, porque uma não basta: grant por coluna decide QUAIS colunas,
-- nunca QUAL valor.
revoke insert on public.salon_invites from authenticated, anon;
grant insert (salon_id, nome, email, role, comissao_percentual)
  on public.salon_invites to authenticated;

-- A restritiva se soma à permissiva em vez de substituí-la (policy permissiva
-- nova só somaria permissão). `using (true)` para não mexer em leitura nem em
-- cancelamento: o que ela nega é escrever 'owner'. `service_role` tem
-- BYPASSRLS, então `admin-invite-salon` continua criando convite de dono.
create policy "salon_invites: convite de dono e da operacao" on public.salon_invites
  as restrictive for all to authenticated, anon
  using (true)
  with check (role <> 'owner');
