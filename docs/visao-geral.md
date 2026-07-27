# Salão CRM — o que o sistema faz hoje

Compilado ponta a ponta do CRM e dos fluxos n8n. Reflete o estado do branch
`claude/avec-audit-ui-security-cjnxwi` e do projeto Supabase `bukhpvvybeltmhtwamox`.

---

## 1. Como as peças se encaixam

```
Cliente (WhatsApp)
   │
   ▼
Evolution API ──webhook──► n8n (agente IA) ──┐
                                             │
Barbearia (navegador)                        ▼
   │                                    Supabase
   ▼                              (Postgres + Auth + RLS
CRM React na Vercel ──────────────► + Realtime + Edge Functions)
                                             │
                                             ▼
                                    Asaas (assinatura)
```

O Supabase é o centro. O CRM fala com ele direto (com RLS aplicando as
permissões) e, para o que precisa de privilégio elevado, através de Edge
Functions. O n8n também escreve no mesmo banco, com service role.

---

## 2. Hierarquia de acesso

Três papéis, gravados em `user_salons.role`. Essa é a **única** fonte de
verdade — as políticas do banco consultam essa tabela, então o que a tela
mostra é o que o banco de fato permite.

| | Dono | Gerente | Barbeiro |
|---|---|---|---|
| Agenda | ✓ | ✓ | só os dele |
| Financeiro | ✓ | ✓ | só o dele |
| Catálogo | ✓ | ✓ | acrescenta serviço |
| Clientes | ✓ | ✓ | — |
| Equipe | ✓ | ✓ | — |
| Conexão WhatsApp | ✓ | ✓ | — |
| Rede / Equipe da rede | só com 2+ unidades | — | — |
| Assinatura | ✓ | — | — |

O barbeiro pode **acrescentar** serviço ao catálogo, mas não apaga nem edita
o que o gestor cadastrou (`services.created_by`).

O dono corrige qualquer função na tela **Equipe da rede**, inclusive a
própria. Duas travas: uma unidade não pode ficar sem dono, e rebaixar a si
mesmo pede confirmação.

---

## 3. O que o CRM faz

### Agenda (`/`)
Grade do dia por profissional, com arrastar para reagendar, mini-calendário e
alerta de agendamento próximo. Ao criar reserva, só aparecem os barbeiros que
executam o serviço escolhido (`professional_services`).

Clicando no agendamento: **Concluir e cobrar** (leva à comanda), **Cancelar**,
**Alterar data/horário** e excluir.

O banco impede dois agendamentos no mesmo horário para o mesmo profissional —
constraint `EXCLUDE USING gist`, erro `23P01`, tratado com mensagem clara em
todos os pontos que agendam.

### Financeiro (`/financeiro`)
Duas abas.

**Visão geral:** faturamento, clientes atendidos, agendamentos e cancelamentos,
cada um com mini-gráfico e comparação com o período anterior. Meta de
faturamento editável, com comemoração quando é batida (uma vez por mês).
Serviços mais vendidos. Exportação por mês ou semana.

**Vendas:** comanda com serviços e produtos, forma de pagamento, baixa de
estoque e cálculo de comissão.

Ainda nessa tela, para gestor: **Caixa** (abertura com troco, fechamento com
conferência contra o esperado — só dinheiro, já que cartão e pix não passam
pela gaveta) e **Fechamento de comissão** por mês, marcando o que foi pago.

### Clientes (`/clientes`)
Cadastro com histórico de atendimentos e compras, importação e exportação CSV,
contagem de clientes novos por período.

### Catálogo (`/catalogo`)
Serviços (nome, duração, preço) e produtos (custo, venda, estoque atual e
mínimo).

### Equipe (`/equipe`)
Convite por link de uso único, com escolha entre **barbeiro** e **gerente** e
percentual de comissão. Convite pendente pode ter o e-mail trocado ou ser
cancelado. Horário de trabalho por barbeiro, por dia da semana.

### Conexão (`/conexao`)
QR code para parear o WhatsApp da unidade e dashboard do agente: conversas,
tempo de resposta, agendamentos, cancelamentos e reagendamentos feitos pela IA.

**Cada unidade tem a própria conexão** — instância `salon-<id>` na Evolution,
com número, conversas e agente próprios.

### WhatsApp WEB (`/web`)
Espelho das conversas. O dono assume a conversa (o agente pausa
automaticamente ao enviar mensagem manual) e devolve ao agente quando quiser.
Conversa que precisa de humano vem com um resumo do contexto escrito pela IA.

### Rede (`/rede`) — dono com 2+ unidades
Faturamento, ticket médio, agendamentos, clientes novos e taxa de cancelamento
da rede somada. Gráfico de faturamento por dia, barras por unidade,
comparativo com barra proporcional e produção por barbeiro em todas as
unidades. Criação de unidade nova, com opção de copiar o catálogo.

### Equipe da rede (`/rede/equipe`) — dono
Time de cada unidade, com troca de função.

### Assinatura (`/assinatura`) — dono
Planos Básico e Pro, preço por unidade com desconto para rede, status da
assinatura e checkout pelo Asaas.

### Cadastro de barbearia (`/admin/nova-barbearia`)
Fora do CRM, protegido por `ADMIN_TOOL_SECRET`. Cria rede ou unidade avulsa,
conta do dono com senha temporária, catálogo inicial e horário de
funcionamento. Também lista, edita e ativa/desativa barbearias.

---

## 4. Edge Functions

| Função | JWT | O que faz |
|---|---|---|
| `whatsapp` v16 | sim | Conectar/status/desconectar a instância, registrar o webhook do n8n, enviar mensagem manual e devolver a conversa ao agente. Opera sobre a unidade selecionada. |
| `admin-create-salon` v12 | não (secret próprio) | Cadastro e administração de barbearias |
| `accept-invite` v4 | não | Aceita o convite: cria conta, vínculo, ficha de profissional e liga aos serviços |
| `asaas-checkout` | sim | **Não publicada.** Cria cliente e assinatura no Asaas |
| `asaas-webhook` | não (token próprio) | **Não publicada.** Confirma pagamento, atraso e cancelamento |

---

## 5. O que o n8n faz

### Fluxo de atendimento — `rJO1n7cFeNDIJyB5` — **ativo**

Webhook da Evolution → normaliza o payload → ignora mensagem própria →
identifica a barbearia pela instância → trata o tipo de mensagem (texto direto,
áudio transcrito por Whisper, imagem descrita por modelo de visão, outros tipos
recebem resposta padrão) → cria ou atualiza a conversa → grava a mensagem →
verifica se o dono assumiu (`agent_paused`) → confere se a barbearia está ativa
→ monta o contexto → chama o agente → grava a resposta → envia pelo WhatsApp.

**O agente sabe:** nome da barbearia, telefone do cliente (nunca pergunta), se
ele já é cadastrado, data e hora atual e o horário de funcionamento.

**Ferramentas:** criar cliente, listar profissionais e serviços ativos,
consultar horário de trabalho do profissional, verificar disponibilidade,
criar agendamento, cancelar agendamento e chamar o dono.

**Checagem de horário em três camadas:** funcionamento da barbearia → escala do
barbeiro → agenda ocupada. Se o horário for tomado durante a conversa, o
agendamento falha com `23P01` e o agente oferece outro sem repetir a tentativa.

**Memória:** montada a partir de `whatsapp_messages`, então inclui o que o dono
respondeu pela aba WEB.

### Fluxo de lembretes — `DW0nq1Jyp9xeOJwm` — **inativo**

A cada 10 minutos busca agendamentos que começam em 55–65 minutos e ainda sem
lembrete, e manda mensagem perguntando se o cliente confirma. Marca
`lembrete_enviado` para não repetir e registra a mensagem no histórico.

Corrigido mas **não ativado**: ativar dispara WhatsApp real a cada 10 minutos.

---

## 6. Duas colunas que parecem sem uso, mas não são

`clients.telefone_norm` e `appointments.lembrete_enviado` não aparecem no
código do CRM — quem usa são os fluxos n8n. A primeira é o que faz o número do
WhatsApp (`5541…`) casar com o do CRM (`41…`); a segunda evita lembrete
duplicado. Não remova.

---

## 7. Pendências

**Bloqueiam uso real**
- Secrets do Asaas e publicação das duas funções
- Ativar o fluxo de lembretes
- Nenhuma unidade tem WhatsApp conectado

**Construído mas não ligado**
- Bloqueio por plano: `usePlano().temRecurso()` existe, nenhuma tela consulta
- Tela para escolher quais serviços cada barbeiro faz (hoje todos fazem tudo)

**Sem tela**
- `stock_movements` — gravado na venda, nunca lido
- `appointments.recorrente_regra` — agendamento recorrente

**Recursos do plano Pro ainda não construídos**
- Recuperação de clientes sumidos
- Site da barbearia

**Infra**
- Convite por e-mail (hoje link copiável) — falta SMTP
- Proteção de senha vazada no painel de Auth
- Rotacionar a chave da 21st.dev, exposta em texto no chat
