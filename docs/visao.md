# Visão do produto

Intenção do projeto na voz do dono, capturada em 2026-07-30. Existe porque o
grafo indexa o que o código **é**, não o que ele **deveria ser** — sem isto, o
propósito é inferido do mecanismo, e a inferência erra.

Onde está escrito **`[ABERTO]`**, a resposta ainda não existe. Não preencher por
conta própria: perguntar.

---

## 1. Para quem é

Três formatos, todos suportados pelo mesmo produto:

1. **Dono de rede** — várias unidades, atua como supervisor ("monopólio"), só
   fica de olho
2. **Barbearia única com vários barbeiros** — o dono muitas vezes atua também
   como barbeiro
3. **Barbearia de um só barbeiro** — que é o próprio dono

O gerente aparece no formato 1 e 2: assume a responsabilidade da unidade pelo
dono e toma decisões.

**Todos os papéis operam o sistema.** Não é um painel só de gestão.

## 2. A dor central: tempo

O produto não vende "organização". Vende **tempo de volta**.

O que a barbearia quer evitar:
- ficar no celular/PC respondendo agendamento
- perder o domingo ou a folga respondendo cliente
- dividir atenção entre o cliente na cadeira e o WhatsApp

Os dois momentos onde o valor aparece:
- **fora da barbearia** — o barbeiro recupera o tempo livre para usar como quiser
- **dentro da barbearia** — atenção integral ao cliente que está na cadeira

Hoje as barbearias resolvem isso com sistemas concorrentes (que entregam menos
pelo que cobram, na avaliação do dono), grupo de WhatsApp, caderno, ou memória.

## 3. O agente de IA

### Pode decidir sozinho
Agendar, reagendar, cancelar, informar preço.

### Nunca deve fazer
**`[ABERTO]`** — ainda não definido. É a fronteira mais importante do produto e
está sem resposta.

### Quando chama o dono
- sempre que o cliente pedir
- **por iniciativa própria**, quando a situação fica complicada: sugere ao
  cliente falar com o dono

### Cliente grosseiro ou insistindo em algo fora do escopo
Tratar com empatia e cordialidade, sugerir falar com o dono, **e deixar um
aviso ao dono sobre o estado emocional do cliente** (irritado, normal…) para
ele saber o que vai encontrar.

> Não existe no código. Requer um campo de sentimento/estado na conversa.

### Tom de voz
**Configurável pelo dono**, escolhido no cadastro. Ele decide como o agente
fala com o cliente.

> Não existe no código. Nenhuma tabela guarda preferência de tom.

### Fora do horário de funcionamento
Atende normalmente — o agendamento segue como em qualquer outro momento. Mas só
oferece datas e horas **dentro da rotina real do barbeiro**: dias que ele
trabalha e horários que ele atende.

---

## 4. Papéis e permissões

| Papel | Enxerga |
|---|---|
| Dono de rede | tudo, e altera tudo |
| Gerente | tudo, e altera tudo — escopo exato **`[ABERTO]`** |
| Barbeiro | só o que é dele: agendamentos dele, clientes dele, financeiro dele |
| Dono que também é barbeiro | tudo, e altera tudo |
| Barbeiro único que é dono | tudo, e altera tudo |

**O barbeiro vê apenas o faturamento dele, nunca o da casa.** Confirmado
explicitamente.

### Princípio que atravessa o produto: configurabilidade
O dono deve poder ajustar quem pode o quê. Aparece três vezes:

- **poder do gerente** — o dono escolhe. Buscar antes uma definição do que um
  gerente faz numa barbearia pequena, média e grande, e oferecer isso como
  padrão
- **quem cria e modifica agendamento** — normalmente é o agente de IA, mas o
  dono pode querer que todos possam, ou só ele
- **tom de voz do agente** — ver acima

> Hoje as permissões são fixas nas policies de RLS. Configurabilidade por salão
> exigiria mover parte dessa decisão para dados.

---

## 5. Monetização

### Planos

| | Básico | Pro |
|---|---|---|
| Preço | **R$ 197** | **R$ 299** |
| Ver o CRM | sim | sim |
| Atendimento humanizado pelo agente de IA | sim | sim |
| Lembretes | — | sim |
| Recuperação de clientes antigos | — | sim |
| Site ligado ao Google + botão de WhatsApp | — | sim |
| Atualizações sem custo adicional | — | sim |

- **Teste grátis: 7 dias.** Dentro desse período o dono pode assinar pelo
  próprio CRM
- **Asaas** é o checkout, usado para a recorrência
- **Rede**: preço diferente, em função da quantidade de unidades no pacote.
  Unidade única mantém o preço de tabela

> `plans` tem `preco_unidade` e `preco_unidade_rede`, e `subscriptions` tem os
> campos do Asaas — o schema já reflete isso. Falta todo o código.

### Inadimplência
**`[ABERTO]`** — o que acontece quando o assinante atrasa (corta acesso, avisa,
degrada) não foi respondido.

---

## 6. Ciclo do atendimento (no-show e avaliação)

Fluxo descrito para o cliente da barbearia — distinto de inadimplência de
assinatura:

1. **1h antes** do corte — lembrete ao cliente *(Pro)*
2. **10 min antes** — nova mensagem pedindo que confirme se chega a tempo *(Pro)*
3. **1h depois** do horário agendado — verificar se a comanda está aberta ou
   fechada (via n8n ou Supabase)
   - ainda aberta → **cancelar**, mas permitindo que o barbeiro reverta, caso
     tenha só esquecido de fechar
4. **Depois de fechar a comanda** — mensagem ao cliente pedindo avaliação no
   Google, com o link

> O workflow `CRM Salão - Lembretes de Agendamento` cobre parcialmente o passo
> 1 e está inativo. Os passos 2, 3 e 4 não existem.

---

## 7. Pacotes de crédito

Modelo: *"pague 4 cortes e ganhe 5"* — plano mensal fechado entre a barbearia e
o cliente. **Opcional por barbearia.**

- **venda**: diretamente com o barbeiro
- **`vale_na_rede`**: opção do dono de rede — permite consumir em qualquer
  unidade o pacote comprado numa delas

Prioridade: ainda vai ser trabalhado.

---

## 8. Definição de pronto

Não há uma lista de mínimo viável fechada. A intenção declarada:

> entregar um **v1 funcional** onde o barbeiro usa as funcionalidades sem
> problemas, e continuar melhorando conforme o feedback das barbearias —
> **adicionando coisas novas sem prejudicá-lo em tempo real**

Esse último ponto é um requisito de engenharia, não de produto: mudanças em
produção não podem quebrar quem já está usando. É o que justifica testes, CI e
migrations idempotentes.

**Fora de escopo:** **`[ABERTO]`** — não definido.

## 9. Objetivo pessoal (6 meses)

Liberdade financeira e sair da CLT, para poder focar em outros projetos.

Contexto útil para priorizar: o que aproxima da primeira venda recorrente vale
mais que refinamento interno.
