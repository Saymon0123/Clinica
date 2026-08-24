-- Auditoria e feedback passam a chegar por e-mail.
--
-- **O motivo e a migracao para a API oficial.** Mensagem que o sistema inicia
-- exige template aprovado, e alerta de auditoria tem texto arbitrario -- para
-- caber num template o corpo seria quase todo `{{1}}`, que e justamente o
-- formato que a Meta costuma recusar. O WhatsApp piorou como canal interno
-- exatamente por causa da migracao.
--
-- E nenhuma dessas mensagens e para cliente: sao o produto falando com o dono
-- do produto. Nao ha razao para pagar pedagio da Meta, nem para depender de
-- template aprovado, nem para caber em 1024 caracteres. O e-mail aguenta
-- relatorio longo, que e a forma natural de um alerta de auditoria.

alter table public.canal_de_alertas
  drop constraint if exists canal_de_alertas_provedor_check;

alter table public.canal_de_alertas
  add constraint canal_de_alertas_provedor_check
    check (provedor in ('evolution', 'cloud_api', 'email')),
  add column if not exists email text;

-- Um canal so pode estar configurado de um jeito coerente. Sem isto, trocar
-- `provedor` para 'email' e esquecer o endereco deixaria o alerta sumindo em
-- silencio -- que e exatamente o modo de falha que este canal nao pode ter,
-- porque e o canal que existe para denunciar os outros.
alter table public.canal_de_alertas
  drop constraint if exists canal_de_alertas_coerente;
alter table public.canal_de_alertas
  add constraint canal_de_alertas_coerente check (
    case provedor
      when 'email' then email is not null
      when 'cloud_api' then phone_number_id is not null and destino is not null
      else instance_name is not null and destino is not null
    end
  );

comment on column public.canal_de_alertas.email is
  'Endereco que recebe auditoria e feedback quando provedor = email. Aguenta texto longo, nao depende de template aprovado e nao custa por mensagem -- e nada disso e conversa com cliente.';

update public.canal_de_alertas
   set provedor = 'email',
       email = 'castrocollin01@gmail.com',
       atualizado_em = now();

-- A conferencia passa a olhar so o provedor em uso.
--
-- Antes ela cruzava `instance_name` sempre, e continuaria acusando canal
-- emprestado depois da troca para e-mail so porque a coluna antiga ficou
-- preenchida. Alerta que continua gritando depois de resolvido ensina a
-- ignorar, do mesmo jeito que o que grita sem motivo.
--
-- `drop` antes de `create`: acrescentar `email` no meio da lista de colunas de
-- um `create or replace view` levanta 42P16.
drop view if exists public.canal_de_alertas_conferido;

create view public.canal_de_alertas_conferido
with (security_invoker = on) as
 select c.provedor,
        c.email,
        c.destino,
        c.instance_name,
        c.phone_number_id,
        s.nome as barbearia_emprestada,
        (s.id is not null) as e_de_cliente
   from public.canal_de_alertas c
   left join public.whatsapp_connections wc
     on (c.provedor = 'evolution' and wc.instance_name = c.instance_name)
     or (c.provedor = 'cloud_api' and wc.phone_number_id = c.phone_number_id)
   left join public.salons s on s.id = wc.salon_id;

comment on view public.canal_de_alertas_conferido is
  'O canal de alertas do produto, com `e_de_cliente` dizendo se ele esta saindo pelo WhatsApp de uma barbearia. Deve ser false. Olha apenas o provedor em uso: colunas de provedores antigos ficam preenchidas e nao devem acusar nada.';

revoke all on public.canal_de_alertas_conferido from anon, authenticated;
grant select on public.canal_de_alertas_conferido to service_role;
