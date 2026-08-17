# Fluxo n8n — política de atraso

**Construído em 2026-08-17. Existe, mas está DESLIGADO.**

- Fluxo: `CRM Salao - Politica de Atraso`, id `67oZqGOIoKO6pAeQ`
- View que ele lê: `public.atrasos_para_perguntar` (migrations `0069` e `0070`)

> **Ligar é decisão do dono.** Ligado, ele manda WhatsApp para **clientes reais
> da Curitiba** — a única barbearia com WhatsApp conectado hoje. Ninguém deve
> ligar isso sem antes ver uma mensagem chegar num teste controlado.

---

## O desenho

```
A Cada 10 Minutos → Buscar Atrasados → Um de Cada Vez ─┐
                                          ↑            ↓
                                          └── Perguntar ao Cliente ← Marcar Perguntado
```

**Quatro nós, nenhuma regra.** Toda condição mora na view: gating de plano,
WhatsApp aberto, tolerância da barbearia (`salons.atraso_tolerado_minutos`),
quem já fez check-in, agente pausado, teto de uma hora, o número real do
cliente e o próprio texto da mensagem.

O fluxo não repete nenhuma dessas condições. Espalhá-las pelos nós é exatamente
como elas ficam divergentes — já aconteceu aqui, no fluxo de lembretes, que
marcava envio por instância morta porque a checagem estava num `IF` em vez de
estar no dado.

## Três decisões que valem conhecer

**Marcar vem ANTES do envio** — ao contrário do "Aviso de Fim de Teste", que
marca depois. A diferença é a janela: aquele roda uma vez por dia, e se o envio
falha o aviso volta amanhã. Este roda a cada 10 minutos dentro de uma hora — se
o update falhasse depois do envio, o cliente receberia a mesma pergunta **seis
vezes**. Perder uma pergunta é muito menos grave que bombardear.

**Um de cada vez**, com `onError: continueRegularOutput` no envio. Um erro não
pode abortar o lote e deixar os próximos atrasados sem pergunta.

**A mensagem não ameaça.** Sem "seu horário será dado a outra pessoa", sem taxa,
sem cancelamento. O sistema **não libera nada sozinho** — quem decide é o
barbeiro, na faixa do balcão. Uma mensagem que promete o contrário vira
reclamação.

> Oi, {primeiro nome}! Aqui é da *{barbearia}*.
>
> Seu horário era {hora} e a cadeira está te esperando. Consegue chegar nos
> próximos minutos?

## O que já foi verificado

**Wiring** (execução 7002, com dados simulados, sem tocar no WhatsApp): dois
atrasados entraram, o loop rodou duas vezes com um item por vez, marcou antes de
enviar e terminou limpo.

**A view** (contra produção, transação com `rollback`): um atrasado de 20
minutos aparece com `minutos_de_atraso = 20`, some ao gravar `chegou_em` e some
ao gravar `atraso_perguntado_em`.

## O que falta antes de ligar

1. **Conferir as credenciais na tela.** O criador avisou que o nó HTTP foi
   pulado na atribuição automática. Abrir os nós `Buscar Atrasados`,
   `Marcar Perguntado` (Supabase account) e `Perguntar ao Cliente`
   (Evolution API - CRM Salão) e confirmar que estão preenchidos.
2. **Um teste controlado, sem terceiros.** Hoje só a Curitiba tem WhatsApp
   aberto, e os clientes dela são reais. O caminho limpo:
   - conectar o WhatsApp da **El Guardians** (a barbearia de teste);
   - cadastrar um cliente com o **seu próprio número**;
   - criar um agendamento 15 minutos no passado;
   - rodar o fluxo à mão e conferir se a mensagem chega.
3. **Só então ativar.**

## Como ver quem está na fila agora

```sql
select barbearia, cliente, hora_marcada, minutos_de_atraso, destino
  from public.atrasos_para_perguntar;
```

Lista vazia é o normal — só aparece quem está atrasado além da tolerância
naquele instante.
