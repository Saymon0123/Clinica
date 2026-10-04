# Estado do projeto

**Atualizado em 2026-10-03** (atualização parcial: a fila de espera, a troca do
provedor de pagamento e a contagem de testes. O resto do arquivo é de 2026-08-16
e **envelheceu** — conferir no [`backlog.md`](backlog.md) antes de confiar.)

Três perguntas, meia página. Se passar de uma, virou backlog — e para isso já
existe o [`backlog.md`](backlog.md).

> **Regra:** o que for declarado pendente numa conversa entra aqui **antes** do
> fim dela. Foi por não existir este arquivo que "backup" e "domínio"
> atravessaram dias sendo repetidos sem sair do lugar, e que o CI ficou
> vermelho por três pushes sem ninguém notar.

---

## 1. O que funciona hoje

O caminho de venda existe inteiro e **já foi percorrido com dinheiro real**
(2026-08-16): página de vendas → conta → confirmação por e-mail → barbearia
criada → assinatura → pagamento → acesso liberado pelo webhook, sem intervenção.

| Peça | Estado |
|---|---|
| CRM | agenda, clientes, catálogo, equipe, financeiro, configurações |
| Agente de WhatsApp | atende, agenda, remarca, cancela e registra confirmação |
| Lembrete e confirmação de chegada | só no Pro, via `salons_com_automacao` |
| Cobrança | assinar, pagar, trocar de plano com rateio, cancelar, bloquear |
| Entrada de clientes | cadastro aberto **e** convite por link |
| QR do balcão | cliente sem hora marcada agenda sozinho — **só na Curitiba**, pela chave `agenda_publica` |
| Fila de espera | o cliente se inscreve pela conversa, o sistema procura a vaga e segura por 30 min, e o dono vê na agenda com o telefone. **O aviso automático está pronto e DESLIGADO** — ver as decisões suas, abaixo |
| Jurídico | termos e privacidade publicados, com aceite registrado |
| Vigilância | auditoria do agente, fronteira, teto de uso, alerta de queda |
| CI | verde nos dois jobs; pgTAP passou pela primeira vez em 2026-08-16 |

**Duas barbearias reais** no banco (Curitiba e São José) mais a **El Guardians**,
usada no teste de pagamento.

## 2. O que está pendente

**Bloqueia crescer:**

- **Backup** — a premissa deste item **mudou e ninguém atualizou**: o texto dizia
  *"Supabase no plano gratuito, sem backup gerenciado"*, e em 03/10 a
  organização está no plano **Pro** (`tier_pro`, conferido na API). O Pro inclui
  backup diário pela plataforma, então o risco não é mais "não existe backup".
  **O que continua aberto é o que sempre importou:** ninguém nunca testou uma
  **restauração**. Backup que não foi restaurado uma vez é suposição, não
  garantia — e é isso que vale agendar.
- ~~**Domínio próprio**~~ — resolvido: `clubcut.space` no ar desde 04/09
  (Hostinger, renova 04/09/2027), com Vercel, Supabase Auth, n8n e QR do
  balcão apontados; canonical e OG do `index.html` alinhados em 15/09.

**Trava o funil:**

- Entrega de e-mail testada **só no Gmail**. Todo o cadastro depende dela.
- ~~Pix e boleto bloqueados na conta do Asaas~~ — **o Asaas saiu.** A cobrança é
  **PIX no AbacatePay** (`cobrar-uso` cria, `abacate-webhook` confirma). A edge
  chamada `asaas` continua existindo e sendo chamada pelo CRM, mas é só o nome
  velho: ela não fala com provedor nenhum.
- ~~El Guardians cobra R$ 5,00/mês no Asaas~~ — **não importa**: era conta de
  teste, e o provedor saiu (dono, 03/10).

**Decisões suas, não código:**

- **Ligar o aviso da fila de espera**, se quiser: (1)
  `update public.whatsapp_templates set ativo = true where chave = 'fila_vaga_abriu';`
  e (2) ativar o workflow `CRM Salão - Fila de Espera (Aviso de Vaga)` no n8n.
  Faltando qualquer uma das duas, nada é enviado e ninguém é chamado. Os outros
  dois templates da fila voltaram da Meta como `marketing` (custam ~9x) e seguem
  desligados — a fila funciona inteira sem eles.
- Data do backup e data de início da emissão de NF (assumidas em contrato)
- Comarca do contrato e se haverá multa (recomendação: não haver)
- Levar o [`contrato.md`](contrato.md) a um advogado

**Verificação que falta:** o QR do balcão foi testado num **domingo**, com a
Curitiba aberta na marra e restaurada depois. Falta ver a lista real num dia
útil, com os dois barbeiros e a agenda cheia.

**Dívida conhecida:** ver [`backlog.md`](backlog.md) — 33 itens abertos.

## 3. Próximo passo

**Conseguir cinco barbearias pagando, pelo convite**, medindo ativação,
retenção e custo real de IA — antes de gastar com anúncio.

Em construção em paralelo, atrás da chave: o **balcão**. Prontos o QR com
horários livres e agendamento pelo próprio cliente (chave `agenda_publica`),
adiantar quem espera (`trocar_horarios`) e o **check-in** — a faixa "No balcão"
na agenda, gravando `chegou_em`, `iniciado_em` e `faltou`, atrás da chave
`balcao`. Falta só a **política de atraso** — e ela tem metade no **n8n**: a
mensagem dos 10 minutos fala com o cliente, e nada que fale com o cliente existe
sem passar por lá.

O raciocínio está em [`autosservico.md`](autosservico.md): sem esses números,
tráfego pago compra aprendizado pelo preço mais caro que existe. Com eles,
compra crescimento.

---

## Como verificar que nada quebrou

```
node --version && npx vitest run          # 573 testes em 64 arquivos
npx tsc --noEmit && npx oxlint src/       # typecheck e lint
gh run list --limit 1                     # o CI ficou verde?
```

E a [rotina de verificação](../supabase/verificacao/rotina.sql), que exercita
dez regras de negócio contra o banco de produção dentro de uma transação com
`rollback` — carência, corte, teto de uso, gating de plano e a fronteira do
agente.
