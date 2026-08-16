-- Agendamento feito pelo próprio cliente, na página pública do QR.
--
-- Vira uma origem própria, e não `crm`, por dois motivos práticos: dá para
-- **medir** quanto o QR do balcão realmente traz, e dá para limitar só essa via
-- sem mexer no que o barbeiro e o agente fazem.
alter table public.appointments drop constraint if exists appointments_origem_check;
alter table public.appointments
  add constraint appointments_origem_check
  check (origem in ('crm', 'agente', 'publico'));

comment on column public.appointments.origem is
  'Quem criou: crm (barbeiro), agente (WhatsApp) ou publico (o proprio cliente, pelo QR do balcao).';
