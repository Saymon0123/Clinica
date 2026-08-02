# Mercado, concorrência e roadmap

Levantamento de 2026-07-30. Complementa [`visao.md`](visao.md) (o que queremos)
e [`backlog.md`](backlog.md) (o que falta).

---

## 1. Escopo completo de um concorrente maduro

Referência: Trinks (fundada em 2015, líder no mercado brasileiro de beleza),
AppBarber, Booksy, Avec.

| Módulo | Trinks | Nosso projeto hoje |
|---|---|---|
| Agenda online (cliente escolhe horário) | sim | **não** — só o CRM e o agente agendam |
| Agenda interna multiprofissional | sim | sim |
| Cadastro de clientes + histórico | sim | sim |
| Comanda / caixa | sim | sim |
| Comissões | sim | sim |
| Estoque com alerta de reposição | sim | tabelas existem, sem alerta |
| Relatórios | **130+** | ~6 indicadores |
| Programa de fidelidade (pontos) | sim | **não** |
| Clube de assinatura (recorrência do cliente final) | sim | tabelas de pacote, sem tela |
| Emissão de NFe | sim | **não** |
| Conta digital / split de pagamento | sim | **não** |
| Marketplace (descoberta de novos clientes) | Booksy/Trinks | **não** |
| Multiunidade / rede | sim | sim |
| App próprio do cliente final | sim | **não** |
| **Agente de IA no WhatsApp** | **não** | **sim** |

### O que eles têm que nós não temos (por ordem de impacto comercial)

1. **Agenda pública de autoatendimento** — link onde o cliente marca sozinho,
   sem falar com ninguém. É o recurso mais citado nas comparações.
2. **Clube de assinatura do cliente final** — "2 cortes/mês por R$ 69". Tendência
   forte de 2026; gera receita previsível para a barbearia e é argumento de
   venda do software.
3. **Fidelidade por pontos.**
4. **Volume de relatórios.** 130 contra 6. Provavelmente irrelevante para
   barbearia pequena, mas usado como argumento em comparativos.
5. **NFe e conta digital.** Barreira alta, público limitado.
6. **Marketplace.** Booksy vende presença: o cliente final descobre a barbearia
   dentro do app. É aquisição, não gestão.
7. **App próprio para o cliente final.**

### O que temos que eles não têm

**O agente de IA conversacional no WhatsApp.** Nenhum dos CRMs tradicionais
oferece atendimento por IA que agenda dentro da conversa. Eles oferecem
*notificação* automática (lembrete, confirmação por link), não *conversa*.

Isso é a nossa cunha. Não é "um CRM mais barato" — é uma categoria diferente.

---

## 2. Preço: o dado mais importante do levantamento

| Produto | Faixa mensal |
|---|---|
| Tua Agenda | R$ 19,90 |
| AppBarber (1 profissional) | R$ 79,90 |
| AppBarber (2–5 profissionais) | R$ 109,90 |
| Trinks (1–2 profissionais) | ~R$ 110 |
| **Nosso Básico** | **R$ 197** |
| Assistente Smart (chatbot IA) | a partir de R$ 199 |
| **Nosso Pro** | **R$ 299** |

**Conclusão:** existem dois mercados com preços diferentes.

- **CRM/agenda tradicional:** R$ 20 a R$ 110
- **Agente de IA no WhatsApp:** R$ 199 para cima

Nosso preço está **acima do mercado de CRM e dentro do mercado de IA**. Isso
só se sustenta se a venda for do agente, não do CRM. Se o vendedor disser
"é um sistema de gestão", o cliente compara com R$ 79,90 e acha caro. Se
disser "é um funcionário que atende seu WhatsApp 24h, e vem com o sistema de
gestão de brinde", o preço fica barato.

O posicionamento é o produto mais frágil que temos — e não custa nada corrigir.

---

## 3. Dados que sustentam a proposta de valor

Úteis na página de vendas e na conversa comercial:

- lembretes automáticos reduzem no-show em **40% a 70%** (várias fontes)
- **67%** dos consumidores já esqueceram um compromisso por falta de lembrete
- **74%** dos brasileiros preferem agendar serviço pelo celular (Sebrae)
- barbearias com agendamento online relatam até **30% mais clientes**
- modelos de pagamento recorrente mostram até **50% menos no-show**

O ciclo de no-show descrito na `visao.md` (lembrete 1h antes, confirmação 10min
antes, verificação da comanda) ataca diretamente o número que o dono sente no
bolso.

---

## 4. Corte de versões

### v1 — o que dá para ter pronto amanhã

Premissa: **o que já funciona hoje está validado** (teste ponta a ponta de
2026-07-29: onboarding, login, papéis, catálogo, equipe, clientes, agenda com
trava de sobreposição, financeiro com comissão, caixa). O v1 não é construir —
é fechar buracos e habilitar a venda.

1. **Corrigir os 3 defeitos encontrados no teste**
   - cliente órfão quando o agendamento falha
   - guard de papel em `/web` e `/conexao`
   - edição de comissão de membro existente
2. **Consertar e ativar o fluxo de lembretes** — falta a checagem de
   `agent_paused` e a ordem do `lembrete_enviado`. É a funcionalidade com melhor
   relação impacto/esforço de todo o backlog (reduz no-show em até 70%)
3. **Cobrança manual, sem código** — link de pagamento do Asaas gerado à mão,
   ativação da conta por você. Escala até ~50 clientes sem dor
4. **Reposicionar a comunicação** — vender o agente, não o CRM

### v2 — próximas 2 a 4 semanas

1. **Gating de planos + trial de 7 dias em código** — quando a cobrança manual
   começar a doer
2. **Agenda pública de autoatendimento** — o maior buraco funcional contra a
   concorrência, e reforça o agente em vez de competir com ele
3. **Confirmação 10min antes + verificação da comanda 1h depois + pedido de
   avaliação no Google** — completa o ciclo de no-show
4. **Tom de voz configurável pelo dono**
5. **Aviso de estado emocional do cliente ao escalar**

### v3 — depois da primeira dezena de clientes pagando

1. **Clube de assinatura do cliente final** (usa as tabelas de pacote que já
   existem) — tendência de 2026 e gera receita previsível para a barbearia
2. **Site institucional ligado ao Google** (prometido no Pro)
3. **Recuperação de clientes antigos** (prometido no Pro)
4. **Permissões configuráveis por salão**
5. **Fidelidade por pontos**

### Fora de escopo (decisão explícita)

- **NFe** — barreira regulatória alta, público pequeno
- **Conta digital / split de pagamento** — vira fintech, não é o negócio
- **Marketplace** — exige massa crítica de clientes finais
- **App nativo do cliente final** — o WhatsApp já é o app; é a nossa tese
- **130 relatórios** — barbearia pequena usa 5

---

## 5. Meta de 200 unidades até dezembro: leitura honesta

200 × R$ 197 = **R$ 39.400/mês** de receita recorrente.

De agosto a dezembro são 5 meses → **~40 novas unidades por mês**, ou 2 por dia
útil, sustentado, partindo de zero, já descontando cancelamento.

**O gargalo não é o software.** Com o v1 acima, o produto atende 200 barbearias
tecnicamente. O que não existe é a máquina de distribuição: ninguém prospectando,
nenhum canal, nenhuma prova social, nenhum caso de sucesso.

### A meta real é outra

O objetivo declarado é **sair da CLT antes do Natal**. Isso não exige 200
unidades — exige substituir o salário.

| Unidades | MRR (Básico) |
|---|---|
| 20 | R$ 3.940 |
| 40 | R$ 7.880 |
| **50** | **R$ 9.850** |
| 100 | R$ 19.700 |
| 200 | R$ 39.400 |

**40 a 50 unidades provavelmente já resolvem o objetivo real**, e são uma meta
de 8 a 10 novos clientes por mês — factível com venda ativa de uma pessoa só.

Recomendação: perseguir **50 unidades até dezembro** como meta de compromisso, e
tratar 200 como teto otimista. A diferença entre as duas não está no código, e
sim em contratar vendedor, criar canal de indicação, ou fechar parceria com
distribuidor de produto para barbearia.

### O primeiro cliente é o marco que importa

Nada no roadmap vale mais que **uma barbearia pagando e usando**. Ela dá o caso
de sucesso, o depoimento, a lista de defeitos reais e a confiança de que a
categoria existe. Priorizar o que a leva a pagar, e adiar todo o resto.
