-- 0117: índice de cobertura da FK criada na 0115 (advisor de performance).
-- salons.remetente_phone_number_id entra nos laterais de escolha de remetente
-- das views de envio; sem índice, cada varredura paga seq scan em salons.
create index if not exists idx_salons_remetente
  on public.salons (remetente_phone_number_id)
  where remetente_phone_number_id is not null;
