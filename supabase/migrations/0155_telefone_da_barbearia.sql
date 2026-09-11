-- 0155: o telefone da barbearia, quando existe, é um telefone
--
-- A11 do giro de 10/09. O WhatsApp da barbearia é o botão "Falar com a
-- barbearia" da agenda pelo QR e do link do horário — a saída do cliente que
-- não consegue marcar sozinho. Ele era opcional em quase toda porta, e sem ele
-- a saída sumia em silêncio. A tela e as edge functions passaram a exigi-lo;
-- esta CHECK garante o formato no banco, com a mesma régua do telefone do
-- cliente (`private.telefone_valido`, 0128: 10 a 13 dígitos, máscara ignorada).
--
-- Por que não NOT NULL: o convite pelo painel (`admin-invite-salon`) cria a
-- barbearia ANTES de o dono aparecer, e só ele sabe o número — quem o grava é o
-- `accept-invite`, no aceite. Até lá o campo fica vazio, e o checklist de
-- ativação avisa o dono.
alter table public.salons drop constraint if exists salons_telefone_valido;
alter table public.salons add constraint salons_telefone_valido
  check (telefone is null or private.telefone_valido(telefone));
