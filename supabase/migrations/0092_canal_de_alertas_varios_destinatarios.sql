-- `email` passa a aceitar mais de um destinatario, separados por virgula.
--
-- Nao virou coluna de array nem tabela filha de proposito: o formato
-- "a@x.com, b@y.com" e exatamente o que o SMTP espera no cabecalho To, entao
-- ele atravessa o n8n sem ninguem precisar montar nada. Uma tabela filha daria
-- normalizacao que nao serve para nada aqui -- e uma linha so, lida por um
-- fluxo so, e o destino nao se relaciona com mais nada no sistema.
--
-- **O preco disso e que texto livre poderia entrar.** Dai a validacao abaixo:
-- sem ela, um endereco digitado errado faria o envio INTEIRO ser recusado pelo
-- SMTP -- nao so o endereco ruim -- e o alerta sumiria em silencio, que e o
-- unico modo de falha que este canal nao pode ter, sendo ele o canal que existe
-- para denunciar os outros.

alter table public.canal_de_alertas
  drop constraint if exists canal_de_alertas_email_valido;

alter table public.canal_de_alertas
  add constraint canal_de_alertas_email_valido check (
    provedor <> 'email'
    or email ~ '^\s*[^@,[:space:]]+@[^@,[:space:]]+\.[^@,[:space:]]+\s*(,\s*[^@,[:space:]]+@[^@,[:space:]]+\.[^@,[:space:]]+\s*)*$'
  );

comment on column public.canal_de_alertas.email is
  'Quem recebe auditoria e feedback quando provedor = email. Aceita varios, separados por virgula -- e o mesmo formato que o cabecalho To do SMTP espera, entao atravessa o n8n sem transformacao. Validado por canal_de_alertas_email_valido: endereco malformado derrubaria o envio inteiro, e o alerta sumiria calado.';

-- `destinatarios` entra no FIM da lista de colunas: acrescentar no meio de um
-- `create or replace view` levantaria 42P16.
create or replace view public.canal_de_alertas_conferido
with (security_invoker = on) as
 select c.provedor,
        c.email,
        c.destino,
        c.instance_name,
        c.phone_number_id,
        s.nome as barbearia_emprestada,
        (s.id is not null) as e_de_cliente,
        case when c.provedor = 'email'
             then array_length(string_to_array(c.email, ','), 1)
             else 1 end as destinatarios
   from public.canal_de_alertas c
   left join public.whatsapp_connections wc
     on (c.provedor = 'evolution' and wc.instance_name = c.instance_name)
     or (c.provedor = 'cloud_api' and wc.phone_number_id = c.phone_number_id)
   left join public.salons s on s.id = wc.salon_id;
