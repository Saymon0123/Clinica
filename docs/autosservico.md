# Auto-serviço — do convite ao tráfego pago

Decidido em 2026-08-12. O produto sai da venda assistida (toda barbearia entra
por convite do dono do produto) e passa a receber cadastro aberto, para escalar
por tráfego pago.

Não é configuração: é mudança de porta de entrada, e muda o que precisa existir.

## Decisões

| Tema | Decisão |
|---|---|
| Trial | 7 dias, **sem cartão** |
| Conexão do WhatsApp | Passo obrigatório do cadastro, com opção de pular **uma vez** |
| Quem entra | Qualquer um, com e-mail confirmado |

## O que essas três escolhas implicam

Juntas, elas são a combinação mais fácil de vender e a mais cara de operar:
qualquer pessoa cria conta, sem compromisso nenhum, e o agente de IA — que
custa dinheiro por mensagem — liga imediatamente.

**Sem trava, o primeiro anúncio vira conta da OpenAI.** As três defesas
mínimas, em ordem de importância:

1. **Teto de mensagens por barbearia em trial.** Um número que cubra um teste
   honesto com folga e corte o uso industrial. Atingido o teto, o agente para e
   o dono é convidado a assinar.
2. **Confirmação de e-mail antes de o agente ligar.** Já decidido; o Supabase
   Auth faz.
3. **Limite de cadastros por IP por dia**, contra criação em massa.

Sem a primeira, as outras duas não protegem o custo — só a identidade.

## A divisão de endereços

| Endereço | O que é |
|---|---|
| `dominio` | página de vendas — onde o anúncio cai |
| `app.dominio` | o CRM |

Separado de propósito: a página de vendas precisa carregar rápido, ter pixel de
conversão e ser editada sem deploy do sistema.

## O que já existe, e não deve ser reconstruído

- cobrança completa: assinar, pagar, webhook liberando acesso, trocar de plano,
  cancelar, bloqueio por inadimplência com 3 dias de carência para o WhatsApp
- aceite dos termos com registro de quem, quando, IP e versão
- conexão do WhatsApp por QR code, feita pelo próprio dono
- checklist de ativação e tour guiado
- isolamento entre barbearias no banco, por RLS

## O que falta construir

Em ordem de construção — cada item depende do anterior.

1. **Cadastro aberto.** Cria conta, barbearia e assinatura em trial numa tela
   só, reusando o aceite dos termos. Hoje `signUp` não existe em lugar nenhum
   do código.
2. **Confirmação de e-mail** e limite por IP.
3. **Teto de uso do agente no trial.**
4. **Conexão do WhatsApp como passo do cadastro**, com pulo único.
5. **Página de vendas.**

## O funil, que é onde o dinheiro vaza

```
anúncio → cadastro → CONECTAR O WHATSAPP → primeiro agendamento → pagante
```

O degrau do meio é específico deste produto e não existe na maioria dos SaaS:
**sem conectar o WhatsApp, o dono não tem produto nenhum** — o CRM é uma agenda
vazia. Quem se cadastrou às 22h e não conectou não volta.

Nenhuma quantidade de anúncio compensa esse degrau. É por isso que ele virou
passo obrigatório do cadastro em vez de item de checklist.
