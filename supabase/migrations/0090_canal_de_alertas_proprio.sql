-- O canal por onde o dono do PRODUTO recebe auditoria e feedback deixa de ser
-- descrito por uma instancia da Evolution.
--
-- Ele nasceu apontando para `salon-c6f6a297...`, que e a instancia da barbearia
-- Curitiba, porque quando isto foi montado era o unico WhatsApp conectado. O
-- provisorio ficou. Isso tem tres consequencias, e nenhuma delas apareceu ainda
-- porque a Curitiba nao caiu:
--
-- 1. Se a Curitiba cancelar ou desconectar, o dono do produto fica cego -- e
--    nada avisa, porque o proprio canal de aviso e que caiu.
-- 2. Mensagem da operacao interna sai pelo numero de uma cliente. O numero e o
--    ativo mais caro dela, e esta carregando trafego que nao e do negocio dela.
-- 3. O historico de saida do WhatsApp dela contem mensagens sobre outras
--    barbearias.
--
-- As colunas novas descrevem o canal sem depender de sessao da Evolution.
-- `instance_name` fica para nao quebrar os fluxos que ainda leem por ele.

alter table public.canal_de_alertas
  add column if not exists provedor text not null default 'evolution'
    check (provedor in ('evolution', 'cloud_api')),
  add column if not exists phone_number_id text;

comment on column public.canal_de_alertas.destino is
  'Numero que RECEBE os alertas: o do dono do produto.';
comment on column public.canal_de_alertas.instance_name is
  'Instancia da Evolution que ENVIA. Legado. Enquanto apontar para a instancia de uma barbearia, o produto esta usando o numero de uma cliente como canal proprio -- ver canal_de_alertas_conferido.';
comment on column public.canal_de_alertas.phone_number_id is
  'Numero da Cloud API que ENVIA. Deve ser um numero do proprio produto, nunca o de uma barbearia.';
comment on column public.canal_de_alertas.provedor is
  'Por onde o alerta sai hoje. Trocar para cloud_api exige phone_number_id preenchido.';

-- Denuncia o canal emprestado.
--
-- Existe porque este defeito e invisivel por natureza: enquanto a barbearia
-- emprestada estiver de pe, tudo funciona, e nada distingue "canal proprio" de
-- "canal de cliente que por acaso ainda responde". So quebra no dia em que ela
-- sai -- e ai quebra justamente a coisa que serviria para avisar.
create or replace view public.canal_de_alertas_conferido
with (security_invoker = on) as
 select c.provedor,
        c.destino,
        c.instance_name,
        c.phone_number_id,
        s.nome as barbearia_emprestada,
        (s.id is not null) as e_de_cliente
   from public.canal_de_alertas c
   left join public.whatsapp_connections wc
     on (c.instance_name is not null and wc.instance_name = c.instance_name)
     or (c.phone_number_id is not null and wc.phone_number_id = c.phone_number_id)
   left join public.salons s on s.id = wc.salon_id;

comment on view public.canal_de_alertas_conferido is
  'O canal de alertas do produto, com `e_de_cliente` dizendo se ele esta saindo pelo WhatsApp de uma barbearia. Deve ser false. Enquanto for true, a operacao interna depende de uma cliente continuar existindo, e o defeito nao aparece ate ela sair.';

revoke all on public.canal_de_alertas_conferido from anon, authenticated;
grant select on public.canal_de_alertas_conferido to service_role;
