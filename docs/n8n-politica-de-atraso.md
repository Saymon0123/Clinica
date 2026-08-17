# Fluxo n8n — política de atraso

**Escrito em 2026-08-17. Ainda não construído.**

A metade da política de atraso que fala com o cliente. O banco já publica a
lista pronta; falta o fluxo que lê e envia.

> **Por que está aqui e não feito:** a sessão que construiu o lado do banco e do
> CRM não tinha acesso ao n8n. Sem este fluxo, a política de atraso **não
> existe** para o cliente — o barbeiro vê o atraso na faixa do balcão, mas
> ninguém pergunta nada a ninguém.

---

## O que o banco já entrega

```sql
select * from public.atrasos_para_perguntar;
```

Uma linha por cliente que **deve** ser perguntado agora. Todas as condições já
estão aplicadas dentro da view — o fluxo **não deve** repetir nenhuma delas:

| Já aplicado | Detalhe |
|---|---|
| Gating de plano | `salons_com_automacao` — só barbearia paga e em dia |
| WhatsApp aberto | `whatsapp_connections.status = 'open'` |
| Tolerância da barbearia | `salons.atraso_tolerado_minutos`, ajustável em Configurações |
| Já chegou ou sentou | `chegou_em` e `iniciado_em` nulos |
| Já perguntado | `atraso_perguntado_em` nulo |
| Telefone utilizável | pelo menos 10 dígitos |
| Teto de uma hora | passado disso, perguntar só constrange |

Colunas devolvidas: `appointment_id`, `salon_id`, `barbearia`, `cliente`,
`telefone`, `instance_name`, `hora_marcada`, `minutos_de_atraso`.

## O fluxo

1. **Agendador** a cada 10 minutos — mesma cadência do fluxo de lembretes.
2. **Ler** `atrasos_para_perguntar`.
3. Para cada linha, **em loop**:
   1. **Agente pausado?** Consultar `agent_paused` na conversa. Se o dono
      assumiu, **pular sem marcar** — ele devolve ao agente e o próximo ciclo
      tenta de novo. É a mesma regra que o fluxo de lembretes aprendeu a ter.
   2. **Marcar `atraso_perguntado_em = now()`** — **antes** do envio.
   3. **Enviar** pela Evolution API, usando `instance_name`.
   4. Erro no envio usa `continueErrorOutput`, voltando ao loop: uma falha não
      pode abortar o lote inteiro.

### Por que marcar antes de enviar

Se o envio falhar, o cliente perde **uma** pergunta. Na ordem inversa, se o
update falhasse, ele receberia a mesma pergunta **a cada dez minutos**. Perder
uma é muito menos grave que bombardear — é o mesmo trade-off já assumido no
fluxo de lembretes.

### Qual número usar

O `contact_phone` da conversa, que é o número real que o WhatsApp usa, caindo
para o `telefone` da view só quando o cliente nunca conversou. Resolve o caso do
número antigo sem o 9.

## A mensagem

Curta, sem cobrança, com saída fácil:

> Oi, {cliente}! Aqui é da {barbearia}. Seu horário era {hora_marcada} e a
> cadeira está te esperando. Consegue chegar nos próximos minutos?

**O que ela não pode fazer:** ameaçar cancelar, cobrar taxa, ou dizer que o
horário será dado a outra pessoa. O sistema **não libera nada sozinho** — quem
decide é o barbeiro, e uma mensagem que promete o contrário vira reclamação.

## O que fazer com a resposta

Nada automático, de propósito. A resposta cai na conversa e o agente trata como
qualquer outra. Se o cliente disser que está chegando, o barbeiro vê no
WhatsApp; se disser que não vem, o barbeiro toca **Não veio** na faixa.

**Por que não automatizar:** nenhum toque da faixa do balcão é obrigatório para
o sistema estar certo, então a ausência de marcação significa duas coisas ao
mesmo tempo — "não veio" e "veio, mas o barbeiro não marcou". Agir sozinho sobre
isso libera a cadeira de quem está sentado ali esperando, e esse é o erro que
dono de barbearia não perdoa.

## Como testar

Só a **Curitiba** tem WhatsApp aberto hoje — as outras duas não produzem linha
nenhuma, o que é o comportamento certo, não defeito.

```sql
-- Cria um atrasado de 20 minutos, confere e desfaz.
begin;
insert into public.appointments (salon_id, professional_id, service_id, client_id, data_hora_inicio, status)
select 'c6f6a297-00b7-4687-b9d3-4f7154cc800f', p.id, s.id, c.id, now() - interval '20 minutes', 'agendado'
  from public.professionals p, public.services s, public.clients c
 where p.salon_id = 'c6f6a297-00b7-4687-b9d3-4f7154cc800f' and p.ativo
   and s.salon_id = p.salon_id and s.ativo and c.salon_id = p.salon_id
 limit 1;
select * from public.atrasos_para_perguntar;
rollback;
```

Verificado em 2026-08-17: aparece com `minutos_de_atraso = 20`, some ao gravar
`chegou_em`, e some ao gravar `atraso_perguntado_em`.
