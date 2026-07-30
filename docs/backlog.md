# Backlog — achados durante testes e auditoria

Registro vivo do que foi identificado mas **não** corrigido, para não se perder
em conversa. Ordenado por risco dentro de cada bloco. Última revisão:
2026-07-29.

Consultável pelo grafo: `graphify query "backlog"` ou `graphify explain "<item>"`.

---

## Segurança

### View `client_package_saldo` é SECURITY DEFINER
Advisor do Supabase classifica como **ERROR**. A view está em `public`, logo
exposta via PostgREST, e por ser SECURITY DEFINER ignora o RLS de quem
consulta — qualquer usuário autenticado pode ler saldo de pacote de qualquer
salão. Hoje não é alcançável pela interface (nenhuma tela usa), mas é
alcançável pela API com a chave anon.

Correção: `alter view client_package_saldo set (security_invoker = on);`

### Rotacionar `EVOLUTION_API_KEY`
A chave foi exposta em texto puro num print durante os testes de 2026-07-29, e
ficou no histórico do PowerShell. É a credencial de administração do servidor
Evolution — permite criar, apagar e ler instâncias de WhatsApp de todos os
salões. Trocar no servidor e atualizar o secret no Supabase.

### Proteção contra senhas vazadas desativada
Supabase Auth pode checar senhas contra o HaveIBeenPwned. Está desligado.
Aviso de nível WARN no advisor.

---

## Correção de comportamento

### Fluxo n8n de lembretes ignora `agent_paused`
O workflow `CRM Salão - Lembretes de Agendamento` (hoje inativo) envia o
lembrete sem consultar `agent_paused`, e registra a mensagem como
`sender: 'agente'`. Se o dono assumiu a conversa, o agente responde por cima —
exatamente o que `n8n-integration.md` proíbe. Falta um nó de consulta + IF
antes do envio.

Também nesse fluxo:
- `Marcar lembrete_enviado` roda **depois** do envio; se o update falhar, o
  cliente recebe o lembrete a cada 10 minutos
- o telefone é montado como `'55' + digitos.replace(/^55/,'')`, que não casa
  com números antigos sem o 9 — o problema que motivou `telefone_norm`

### `whatsapp/index.ts` escolhe salão arbitrário sem `salonId`
Em `supabase/functions/whatsapp/index.ts`, quando `body.salonId` não vem, a
consulta faz `.limit(1).maybeSingle()` e pega um vínculo qualquer. O comentário
logo acima diz por que isso é errado. Para dono de rede com várias unidades,
uma chamada sem `salonId` pode conectar, desconectar ou consultar status da
unidade errada.

Saídas: exigir `salonId` (400 sem ele), ou aceitar o fallback só quando o
usuário tem exatamente um vínculo.

---

### `/web` e `/conexao` são alcançáveis pelo barbeiro
Verificado em 2026-07-29 logando como barbeiro (Giova). Em `App.tsx`, `/web`
está sob `RequireAuth` sem guard de papel, e `/conexao` está no grupo comum do
`AppLayout`. O barbeiro chega nas duas telas — vê a casca da aba WEB e até o
botão "Conectar WhatsApp".

**Não é vazamento de dados.** As duas camadas de baixo barram:
`whatsapp_conversations: gestor` exige `private.is_manager(salon_id)`, então o
barbeiro recebe zero linhas; e a edge function `whatsapp` filtra
`.in('role', ['owner','gerente'])`, devolvendo 404. Severidade baixa — mas
contradiz o escopo declarado na `0015` ("sem acesso a WhatsApp") e parece
defeito para o usuário.

Caminho: guard de papel nas duas rotas, como já existe em `/equipe` (que
bloqueia com mensagem clara) e `/rede` (`RequireNetworkOwner`).

### Cliente órfão quando o agendamento falha por sobreposição
Reproduzido em 2026-07-29. Em `NewAppointmentModal`, o cliente é criado antes
do insert do agendamento. Quando a constraint
`appointments_sem_sobreposicao` recusa (erro `23P01`), o cliente **permanece
gravado sem nenhum agendamento** — não há transação nem rollback.

A mensagem de erro fala apenas do horário, então o usuário não percebe que
criou um cliente. Cada nova tentativa com um nome digitado suja a base: três
tentativas em horário ocupado = três clientes fantasma na aba Clientes.

Caminho: criar o agendamento primeiro e o cliente só depois, ou envolver os
dois numa função no banco (RPC) que faça o rollback junto. A segunda opção é
mais robusta, porque a mesma ordem errada existiria em qualquer outro chamador.

### Mensagem de comissão engana quando não há vendas
No Financeiro, com zero vendas no período, aparece: *"Nenhuma comissão no
período (defina o percentual de comissão do profissional para calcular)"* —
mesmo quando o percentual **está** definido (verificado com a Giova, 60%). A
mensagem atribui à configuração o que na verdade é ausência de venda, e manda
o usuário mexer numa tela que não tem esse ajuste (ver item da comissão).

Caminho: separar as duas causas — sem venda no período vs. profissional sem
percentual.

## Funcionalidade ausente

### Editar comissão de membro existente
`comissao_percentual` só é definida no convite (`EquipePage.tsx:352`). Depois
de aceito, não há tela que edite. Consequências:
- o dono criado pelo wizard fica sempre sem comissão (o wizard não pede)
- renegociar percentual de um barbeiro é impossível pela interface

Pior: `useFinanceiroData.ts:185` trata `null` como **0**, então o financeiro
mostra comissão zerada sem erro nem aviso — um teste passa escondendo o
problema.

Caminho: botão de editar na lista de equipe atualizando
`professionals.comissao_percentual`, sob a policy de gestor que já existe.

### Wizard de criação não pede comissão nem jornada
`SalonWizard` cria salão, dono, profissional e serviços, mas não popula
`professional_schedules` nem `comissao_percentual`. A jornada tem fallback
documentado (cai no horário do salão); a comissão não tem.

### Pacotes de crédito e planos não têm interface
7 tabelas com RLS e policies completas (`packages`, `package_items`,
`client_packages`, `client_package_credits`, `package_usages`, `plans`,
`subscriptions`) e **zero** referências em `src/`. Não podem ser testados pelo
CRM.

### Integração de cobrança (Asaas) não existe
`subscriptions` tem `asaas_customer_id` e `asaas_subscription_id`, mas nenhuma
linha de código menciona Asaas — nem no front, nem nas edge functions. Schema
pronto, integração ausente. Também não há criação de `subscriptions` no
onboarding.

---

## Infraestrutura e manutenção

### Migrations do repositório não seguem o formato do CLI
Os arquivos são `0001_init.sql`; o Supabase CLI exige
`<14 dígitos>_nome.sql`. O histórico real em produção tem 26 entradas com
nomes diferentes dos arquivos. Consequência: `supabase db push` não faz o que
se espera, e as 20 primeiras migrations **não são idempotentes** (`create
table` puro) — se algum dia o CLI passar a reconhecê-las, tentaria reaplicar e
falharia no meio.

Caminho: renomear para o formato de timestamp, casar com o histórico remoto via
`supabase migration repair --status applied`, e passar a usar
`supabase migration new`.

### Divergência inversa: `profiles` existe no repositório, não em produção
`0002_profiles_and_rls.sql` cria a tabela `profiles`, removida em produção pela
migration `remove_profiles`. As funções `auth_salon_id()` e afins também não
existem mais (sobraram as quatro em `private`). Um banco limpo construído do
repositório sai diferente de produção.

Falta uma `0023` que remova `profiles`, senão o CI testa um schema que
produção não tem.

### Sem Docker na máquina de desenvolvimento
Bloqueia `supabase db start`, `supabase test db` (os testes de RLS em pgTAP) e
`supabase db pull` (diff de schema real). Hoje o pgTAP só roda no CI, e nunca
rodou.

### Ordem invertida no histórico de migrations
`0021_instance_name_unico` foi registrada com timestamp `20260730005330`,
depois de `0022_sincroniza_schema_producao` (`20260729000100`). Sem impacto
funcional — ambas aplicadas — mas inconsistente para quem ler o histórico.

### `oxlint` analisa `.claude/`
Um warning vem de `.claude/skills/design-system/scripts/generate-tokens.cjs`,
que não é código da aplicação. Ruído no CI. Resolve com `ignorePatterns` no
`.oxlintrc.json`.

### Cobertura de testes rasa
Cobertos: `csv`, `appUrl`, contrato de nomeação das instâncias, isolamento
multi-tenant (pgTAP, ainda não executado). Sem cobertura: componentes, hooks
de dados, e todo o fluxo financeiro (caixa, comanda, comissão, meta).

---

## Dívida de qualidade

### `src/App.tsx` / shell de rotas com coesão 0,06
A mais baixa do grafo, 61 nós. É onde tudo se cruza sem estrutura interna.
Refatoração de conforto, não de risco.
