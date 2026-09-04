-- 0138: a agenda pública nasce ligada, e o dono passa a poder desligá-la
--
-- Achado da vistoria de 04/09/2026. O recurso `agenda_publica` tinha
-- `padrao = false` e **nenhum lugar do sistema escrevia** em
-- `recursos_do_salao`: nem edge function, nem tela. Procurei em todas.
-- Consequência prática: barbearia nova nascia com o QR desligado, o bloco em
-- Configurações retornava vazio (`QrDoBalcao` faz `return null` sem o recurso),
-- e o dono não tinha como descobrir que a funcionalidade existia. A única
-- forma de ligar era um insert na mão pelo banco — foi o que eu fiz para
-- conseguir inspecionar a tela.
--
-- Decisão de Saymon: nasce ligada, e Configurações ganha o botão de desligar.
--
-- Por que RPC e não policy de INSERT/UPDATE na tabela: uma policy deixaria o
-- gestor ligar QUALQUER chave de `recursos`, hoje duas e amanhã as que vierem.
-- A porta que este bloco precisa é uma só. Mesmo desenho de `salvar_jornada`
-- (0135) e `quero_atender` (0133).

-- ---------------------------------------------------------------------------
-- 1) O padrão
-- ---------------------------------------------------------------------------

-- `recursos_ativos` é `coalesce(e.ativo, r.padrao)`: mudar o padrão liga o
-- recurso para toda barbearia SEM linha própria, que hoje são todas. É o
-- efeito desejado — quem não quiser passa a ter o botão para desligar.
update public.recursos set padrao = true where chave = 'agenda_publica';

-- ---------------------------------------------------------------------------
-- 2) A porta única
-- ---------------------------------------------------------------------------

create or replace function public.definir_agenda_publica(
  p_salon_id uuid,
  p_ativo boolean
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_salon_id is null or p_ativo is null then
    raise exception 'Informe a barbearia e o novo estado.' using errcode = '22023';
  end if;

  -- As duas checagens, e não só a segunda: `salon_ids()` responde "é minha?" e
  -- `is_manager` responde "mando nela?". Barbeiro não mexe em configuração.
  if p_salon_id not in (select private.salon_ids()) or not private.is_manager(p_salon_id) then
    raise exception 'Sem permissao para mudar esta barbearia.' using errcode = '42501';
  end if;

  insert into public.recursos_do_salao (salon_id, recurso, ativo)
  values (p_salon_id, 'agenda_publica', p_ativo)
  on conflict (salon_id, recurso) do update set ativo = excluded.ativo;
end;
$$;

revoke all on function public.definir_agenda_publica(uuid, boolean) from public, anon;
grant execute on function public.definir_agenda_publica(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Fechar o que estava aberto por descuido
-- ---------------------------------------------------------------------------
--
-- O default privileges do Supabase dá ALL ao `authenticated` em tabela nova, e
-- as duas nasceram assim: INSERT, UPDATE, DELETE e TRUNCATE concedidos. Hoje o
-- RLS segura (não existe policy de escrita, então nada passa), mas é uma
-- camada só — e a `recursos` sequer é por barbearia: uma policy de escrita
-- criada sem cuidado ali mexeria no catálogo do produto inteiro.
--
-- O SELECT fica: `recursos_ativos` é `security_invoker`, então a leitura da
-- view depende dos grants e das policies de quem chama.
revoke insert, update, delete, truncate, references, trigger
  on public.recursos from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.recursos_do_salao from authenticated, anon;
grant select on public.recursos to authenticated;
grant select on public.recursos_do_salao to authenticated;
