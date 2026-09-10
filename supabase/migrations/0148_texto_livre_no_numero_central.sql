-- 0148 — Quem escreve no numero central deixa de ser ignorado.
--
-- `whatsapp-webhook` recebia texto solto no numero central e o jogava num
-- `console.error`. O comentario dizia "Fase 2 responde educadamente apontando o
-- numero certo" -- e a Fase 2 nunca veio.
--
-- O caminho que isso quebrava: o template `lembrete_hoje` pergunta "voce vem?".
-- O cliente DIGITA "pode cancelar" em vez de apertar o botao. Silencio total: o
-- horario continua marcado, o dono nao sabe que ele avisou, a cadeira fica
-- vazia. Pior caso e "quem e?" -- cliente recebendo de numero desconhecido,
-- perguntando, e sendo ignorado. Isso vira denuncia, e o numero central carrega
-- os lembretes de TODAS as barbearias: uma denuncia atinge a base inteira.
--
-- O que NAO da para fazer: entregar ao agente. O agente mora no numero da
-- barbearia (Evolution), e aqui nao se sabe de qual barbearia se trata --
-- escolher uma arbitrariamente mandaria a conversa para a loja errada. Esta
-- funcao existe para DESCOBRIR a barbearia certa, e devolver null quando nao da.

create or replace function public.barbearia_para_contato_central(
  p_telefone text,
  p_message_id text default null
)
returns table (salon_id uuid, nome text, telefone text, quantas integer)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_norm text := nullif(right(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), 8), '');
  v_salon uuid;
begin
  if v_norm is null or length(v_norm) < 8 then
    return;
  end if;

  -- 1) Pelo wamid da mensagem respondida. E a unica via PRECISA: diz de qual
  --    barbearia era a mensagem que a pessoa esta respondendo agora.
  if p_message_id is not null then
    select a.salon_id into v_salon
      from public.appointments a
     where a.lembrete_message_id = p_message_id
     limit 1;

    if v_salon is null then
      select ap.salon_id into v_salon
        from public.avaliacao_pedidos ap
       where ap.message_id = p_message_id
       limit 1;
    end if;
  end if;

  -- 2) Sem wamid: a barbearia do atendimento mais recente desse telefone.
  --    E palpite, mas palpite ancorado -- quem escreve depois de um corte
  --    escreve sobre aquele corte.
  if v_salon is null then
    select c.salon_id into v_salon
      from public.clients c
      left join public.appointments a on a.client_id = c.id
     where c.telefone_norm = v_norm
     group by c.salon_id
     order by max(a.data_hora_inicio) desc nulls last
     limit 1;
  end if;

  if v_salon is null then
    return;
  end if;

  return query
  select s.id, s.nome, s.telefone,
         -- Em quantas barbearias esse telefone e cliente. Com mais de uma, a
         -- resposta precisa admitir que esta chutando em vez de afirmar.
         (select count(distinct c2.salon_id)::integer
            from public.clients c2 where c2.telefone_norm = v_norm)
    from public.salons s
   where s.id = v_salon;
end;
$function$;

comment on function public.barbearia_para_contato_central(text, text) is
  'Descobre a qual barbearia apontar quem escreveu texto solto no numero central: pelo wamid da mensagem respondida, ou pelo atendimento mais recente do telefone. Devolve zero linhas quando nao da para saber -- e ai a resposta e generica, nunca um salao arbitrario.';

-- So a edge com a service key: a funcao atravessa barbearias de proposito
-- (o telefone pode ser cliente de varias), entao nao ha tenant a validar e
-- expor a `authenticated` viraria consulta livre a base de clientes.
revoke all on function public.barbearia_para_contato_central(text, text) from public, anon, authenticated;
grant execute on function public.barbearia_para_contato_central(text, text) to service_role;
