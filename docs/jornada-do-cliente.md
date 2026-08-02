# A jornada do cliente, confrontada com o produto

Da mensagem no WhatsApp até o cliente sair com o corte feito. Levantada de fora
para dentro (benchmark de setor + material de experiência de salão) e **depois**
comparada com o que existe, para a lista não nascer enviesada pelo que já está
construído.

Confronto feito em 2026-08-02. Complementa [`visao.md`](visao.md) (o que
queremos) e [`mercado-e-roadmap.md`](mercado-e-roadmap.md) (as versões).

Legenda: ✅ pronto · ⚠️ parcial · ❌ ausente

---

## Fase 1 — Da mensagem ao "tá marcado"

| Ponto | Estado |
|---|---|
| A mensagem chega (texto, áudio, imagem) | ✅ |
| Identificar quem é, por `telefone_norm` | ✅ |
| Entender a intenção | ✅ |
| Qualificar serviço, barbeiro e horário | ✅ regra explícita de nunca deduzir o serviço |
| Negociar horário disponível | ✅ |
| Confirmar antes de criar | ✅ |
| Agendamento criado + confirmação ao cliente | ✅ |

**Completa.** É o coração do produto e onde ele está mais maduro.

## Fase 2 — O silêncio antes da visita

| Ponto | Estado |
|---|---|
| Lembrete ~1h antes | ✅ ativo e testado em produção |
| Pedir confirmação ~10 min antes | ✅ construído e testado em produção |
| **Registrar quem confirmou** | ❌ `status = 'confirmado'` é estado morto |
| Cliente remarca ou cancela | ⚠️ o agente cancela; remarcar é cancelar + criar |
| **A vaga liberada vira oferta** | ❌ ninguém é avisado |
| Barbearia avisa quando **ela** muda | ❌ |

## Fase 3 — A chegada

| Ponto | Estado |
|---|---|
| Check-in — alguém sabe que o cliente chegou | ❌ |
| Fila e tempo de espera | ❌ |
| Walk-in sem hora marcada | ⚠️ dá para criar na agenda, mas não existe fila |
| Política de cliente atrasado | ❌ |

**A fase inteira não existe.** É o maior buraco do produto.

## Fase 4 — A cadeira

| Ponto | Estado |
|---|---|
| A consulta ("o que vamos fazer hoje?") | ❌ nada guia |
| A memória — o que foi feito da última vez | ⚠️ existe em Clientes; o barbeiro não vê na hora do atendimento |
| O serviço | ✅ |
| Upsell | ⚠️ a comanda aceita somar itens, mas nada sugere |
| Serviço que muda no meio | ⚠️ a comanda aceita; a agenda e a duração não acompanham |

## Fase 5 — O caixa

| Ponto | Estado |
|---|---|
| Comanda com o que foi feito e por quem | ✅ |
| Pagamento (pix, cartão, dinheiro) | ✅ |
| Desconto | ❌ `orders` não tem a coluna |
| **Reagendamento na cadeira** | ❌ |
| Fidelidade / pacote | ❌ removido na `0026`, volta na v3 |

---

## As três conclusões

**1. O produto é forte no começo e some no meio.** Da mensagem ao agendamento
está completo. Do momento em que o cliente entra na barbearia até sair,
praticamente não existe software — e é onde o dinheiro é feito.

**2. Os dois pontos de maior alavancagem estão em estados opostos.** A
confirmação pré-visita, que reduz falta em 35–45%, foi resolvida. O
reagendamento no caixa — cliente que remarca antes de sair volta 40% mais, e o
pedido direto supera "avisa quando quiser" em 3 para 1 — **não existe**.

**3. Quatro buracos são o mesmo buraco.** Check-in, fila, atraso e reagendamento
acontecem **dentro da barbearia, com o cliente presente**. O produto foi
construído para o WhatsApp e ainda não foi construído para o balcão.

---

## Corte por versão

O critério: entra na v1 o que é **pequeno, só no CRM e sem risco para o agente**.
Tudo que mexe no n8n fica para depois do teste de mensagens em produção —
alterar as ferramentas do agente às vésperas de testá-lo é trocar o pneu com o
carro andando.

### v1 — dois itens

**Memória na cadeira.** Mostrar, ao abrir o agendamento, o que esse cliente fez
da última vez: serviço, data e com quem. O dado já existe em `appointments`;
falta exibir no momento certo. É leitura pura, sem migration.

**Reagendamento no caixa.** Ao fechar a comanda, perguntar se quer deixar o
próximo horário marcado. A tela de venda já sabe cliente, profissional e serviço,
e a agenda já existe. É o item de maior efeito em receita recorrente de toda a
lista.

### v2 — o balcão

Check-in, fila com tempo de espera, walk-in e política de atraso. São quatro
pontos do mesmo problema e devem ser desenhados juntos — resolver um sem os
outros gera meia funcionalidade.

Também na v2: registrar a confirmação (`status = 'confirmado'`, ferramenta nova
no agente), avisar o cliente quando **a barbearia** muda, upsell sugerido, e o
serviço que muda no meio refletindo na agenda.

### v3 — quando houver clientes pagando

Vaga liberada virando oferta (depende do motor de campanha), desconto na comanda
(`orders.desconto_valor`, e a decisão de comissão junto), e fidelidade/pacote.
