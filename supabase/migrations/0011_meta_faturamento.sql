-- Meta de faturamento configurável por barbearia (antes era fixa no código).
alter table salons
  add column if not exists meta_faturamento_mensal numeric(10,2) not null default 3000;
