-- "3 meses" ou "45 dias", a partir da contagem de dias.
--
-- Existia copiado nas duas views de reativacao. Com dois toques viraria quatro
-- copias -- e no dia em que o texto mudar, alguem esquece uma.
create or replace function public.tempo_sem_vir(p_dias integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_dias >= 60 then (p_dias / 30)::text || ' meses'
    else p_dias::text || ' dias'
  end;
$$;

comment on function public.tempo_sem_vir(integer) is
  'Formata dias sem vir como texto para o parametro do template: "3 meses" acima de 60 dias, "45 dias" abaixo.';
