# Auditoria — Componente ASAAS (cobrança)

**Data:** 2026-09-05. **Escopo:** fluxo de cobrança (assinatura/uso, webhook de pagamento, troca de plano, cancelamento, bloqueio de acesso). **Método:** leitura do repositório, SELECTs no Supabase de produção (`bukhpvvybeltmhtwamox` / "clinica-crm"), leitura dos workflows do n8n e do código deployado das edge functions. Nenhuma escrita, nenhuma chamada à API do Asaas.

**Aviso de escopo:** o pedido de auditoria menciona "assinaturas" e "troca de plano com rateio". Esse modelo **morreu em 2026-08-24/25**. O modelo vigente é **cobrança por uso** (R$/agendamento do agente, fechamento mensal no banco, boleto avulso pelo Asaas). Evidências: `supabase\functions\asaas\index.ts:4-24` (ações `assinar`, `trocar-plano`, `simular-troca`, `cancelar-troca`, `assinar-rede` removidas), `supabase\migrations\0110_aposenta_plans.sql` (tabela `plans` derrubada, `plano_agendado`/`upgrade_payment_id` dropadas), `supabase\migrations\0097_cobranca_por_uso.sql:1-17`. A auditoria cobre o modelo vigente e o legado que ainda vaza dele.

---

## 1. O que existe hoje

### O fluxo vigente (por uso), ponta a ponta

1. **Assinar não existe.** Usar o sistema é a assinatura. A barbearia nasce em teste: `criar-minha-barbearia/index.ts:39` (`DIAS_DE_TESTE = 7`) e `:189-192` inserem `subscriptions` com `status='trial'` e `acesso_ate = hoje+7`. O trigger `trg_marca_o_fim_do_teste` grava `trial_ate` (`0130_cadeia_de_cobranca.sql:292-311`).
2. **Medição**: `gerar_fatura_de_uso()` congela o período em `faturas_de_uso` — agendamentos de `origem='agente'` (e reativação confirmada), preço por faixa de barbeiros (`faixas_de_uso`, `0097:26-39`: R$ 0,75 até 3 barbeiros, caindo a R$ 0,60). Fechamento mensal via pg_cron `fechamento-mensal-de-uso` (`0 9 1 * *`) — **confirmado agendado e ativo em produção** (SELECT em `cron.job`).
3. **Emissão**: edge function `cobrar-uso` (deployada v4) transforma fatura aberta (`asaas_payment_id is null`, `valor > 0`) em cobrança no Asaas: `POST /v3/customers` (se preciso) e `POST /v3/payments` com `billingType:'UNDEFINED'`, `dueDate = hoje+7`, `externalReference = salon_id` ou `rede:<orgId>` (`cobrar-uso/index.ts:206-219`). Mínimo de R$ 5: abaixo disso a fatura acumula (`:34,145-148`). Sem CPF/CNPJ o grupo é pulado (`:165-170`).
4. **Entrega**: workflow n8n **"CRM Salao - Detalhamento de Uso"** (`8Qh33uoFm4VqT1eO`, ativo, de hora em hora, 282 execuções, todas `success`): nó **Gerar Boletos** chama `POST https://bukhpvvybeltmhtwamox.supabase.co/functions/v1/cobrar-uso`; depois lê `faturas_a_notificar` (e-mail de detalhamento ao dono do produto) e `boletos_a_enviar` (e-mail com link ao dono da barbearia), marcando `notificada_em`/`boleto_notificado_em` **depois** do envio.
5. **Pagamento**: edge function `asaas-webhook` (deployada v21, `verify_jwt=false`) recebe o evento, valida o header `asaas-access-token` contra a env `ASAAS_WEBHOOK_TOKEN`, registra em `asaas_eventos` (idempotência), marca `faturas_de_uso.paga_em` pelo `payment.id` e estende `subscriptions.acesso_ate = dueDate + 1 mês` (+3 dias de `atendimento_ate`), roteando por `payment.subscription` → `organizations`, `externalReference='rede:<orgId>'` → todas as unidades, ou `externalReference=salon_id` → a unidade (`asaas-webhook/index.ts:143-257`).
6. **Bloqueio**: RPC `situacao_do_acesso(salon_id)` (`0131_situacao_do_acesso.sql:24-57`) devolve `bloqueado`/`atendendo` para qualquer vínculo; `src\components\AppLayout.tsx:234-235` troca o CRM inteiro pela tela `AcessoBloqueado` quando `expirada`, exceto a rota `/assinatura`. O WhatsApp segue por 3 dias (`DIAS_DE_TOLERANCIA`, `asaas-webhook/index.ts:21`; views `salons_atendendo`/`salons_com_automacao`, `0131:76-112`). O cron diário `estende-acesso-sem-debito` (`20 4 * * *`, confirmado em `cron.job`) mantém o acesso de quem **não tem fatura vencida em aberto** (`0130:232-274`) — quem não deve não bloqueia.
7. **Cancelar**: único botão do cliente (`src\features\assinatura\CancelarUso.tsx`), chama a edge `asaas` com `{acao:'cancelar', salonId}`. A função valida `role='owner'` pelo JWT, remove recorrência legada no Asaas **se houver** (aborta o cancelamento se o Asaas recusar — `asaas/index.ts:194-200`), marca `status='cancelada'` e gera na hora a fatura parcial via RPC `gerar_fatura_de_cancelamento` (`asaas/index.ts:221-224`; `0097:248-272`).
8. **Rede**: `unificar-rede`/`separar-rede` gravam `organizations.cobranca_unificada` (só o dono de TODAS as unidades; exige CPF/CNPJ válido pelo CHECK `organizations_unificada_exige_documento`, `0130:388-394`). `cobrar-uso` então agrupa as faturas da rede num boleto único.

### Telas

`src\features\assinatura\`: `AssinaturaPage.tsx` (situação + uso), `UsoDoSistema.tsx` (lê `uso_do_sistema_no_mes` e o histórico de `faturas_de_uso`, `:67-69`), `DadosDeCobranca.tsx` (grava `subscriptions.cpf_cnpj` direto via PostgREST), `CobrancaDaRede.tsx`, `CancelarUso.tsx`, `AvisoAssinatura.tsx` (aviso de fim de teste), `AcessoBloqueado.tsx`.

### Estado atual do banco de produção (SELECTs em 2026-09-05)

- **Produção foi zerada em 2026-09-03 a pedido do dono** (`docs\backlog.md:2024-2035`): as 6 contas e 6 barbearias foram apagadas; backup de 485 linhas fora do repo.
- Hoje: **1 salão** (El Guardians, recriado em 2026-09-04), **1 assinatura** (`status='trial'`, `acesso_ate=2026-09-11`, `trial_ate=2026-09-11`, `asaas_subscription_id=NULL`, `asaas_customer_id=NULL`, sem CPF/CNPJ), **0 faturas_de_uso**, **0 asaas_eventos**, **0 organizations**.
- A tabela `plans` não existe mais (confirmado); `subscriptions` tem as colunas do modelo atual, incluindo `trial_ate` (153 migrations aplicadas, última 2026-09-04).
- **A assinatura El Guardians de R$ 5,00/mês citada em `docs\estado-do-projeto.md:50` vive só no Asaas**: o banco recriado não tem nenhuma referência a ela (ver achado 3.1).

### Código deployado = código do repo

Comparei o fonte deployado das três funções (`get_edge_function`) com o repo: **`asaas` v28, `asaas-webhook` v21 e `cobrar-uso` v4 são idênticos aos arquivos em `supabase\functions\`**. Sem drift.

---

## 2. O que está correto e por quê

1. **Idempotência do webhook é real e testável.** `asaas_eventos` tem PK no `id` do evento (`0029_eventos_do_asaas.sql:14-21`); o INSERT é a trava e `23505` = "já tratei" (`asaas-webhook/index.ts:111-126`). Se o efeito falhar, a trava é **removida** para a reentrega do Asaas funcionar (`:258-265`) — o par trava/destrava está certo para entrega at-least-once.
2. **Autenticidade do webhook.** Header `asaas-access-token` comparado com a env `ASAAS_WEBHOOK_TOKEN`; sem a env configurada a função **recusa tudo com 500** em vez de aceitar aberto (`asaas-webhook/index.ts:71-81`). `verify_jwt=false` só nessa função (confirmado no deploy) — necessário para o Asaas alcançá-la.
3. **Evento desconhecido devolve 200** (`:135-137`) — evita a pausa da fila do Asaas após 15 falhas seguidas, que silenciaria as confirmações de pagamento.
4. **Período pago conta do vencimento, não do dia do pagamento** (`:238-239`): quem paga atrasado não ganha o atraso.
5. **Atraso não mexe em datas** (`:254-256`): `PAYMENT_OVERDUE` só muda `status`; quem decide bloqueio é `acesso_ate` — separação correta entre estado informativo e estado que tranca.
6. **A dupla trava de escrita em `subscriptions` está aplicada em produção.** Policy de UPDATE por linha + grant **por coluna** restrito a `cpf_cnpj` (`0030_dono_salva_o_documento.sql:14-15`; confirmado via `pg_policy` e `information_schema.column_privileges`: `authenticated` só atualiza `cpf_cnpj`). O dono não consegue se dar `acesso_ate='2099-01-01'`.
7. **`cobrar-uso` é idempotente e compensa falha parcial**: só olha fatura sem `asaas_payment_id` (`:92-93`); se o registro no banco falhar depois de criar a cobrança, **deleta a cobrança no Asaas** (`:238-243`). Autorização por service key em comparação de tempo constante (`:70-77`), e **sem fallback de URL** — falta de `ASAAS_BASE_URL` falha alto (`:31,82-85`).
8. **A cadeia anti-cobrança-dupla/teste-grátis/bloqueio-injusto (0130)**: `gerar_fatura_de_uso` corta dias de teste e dias já faturados (`0130:73-84`), `fechar_mes_de_uso` pula quem cancelou **só** se a fatura de cancelamento existe (`0130:192-203`), e `estender_acesso_sem_debito` impede bloquear quem não tem dívida vencida com boleto emitido (`0130:263-270`). Os dois crons estão agendados e ativos em produção.
9. **RLS das tabelas de dinheiro**: `asaas_eventos` com RLS ligada e **zero policies** (só service_role escreve/lê — `0029:29`); `faturas_de_uso` legível só pelo dono (`0097:97-106`); `faturas_a_notificar`/`boletos_a_enviar` com grant só para `service_role` (`0099:78-79,106-107`).
10. **Cancelamento aborta se a recorrência legada não morrer no Asaas** (`asaas/index.ts:194-200`) — evita "cancelada no banco, cobrando no Asaas". E a falha ao gerar a fatura parcial não derruba o cancelamento, com o fechamento mensal como rede de segurança (`:221-224` + `0130:167-178`).
11. **n8n marca DEPOIS de enviar** (`Marcar Como Notificada`/`Marcar Boleto Enviado` vêm após o `emailSend`, com retry): e-mail que falha volta à fila em vez de sumir; o boleto acumulado marca todas as faturas irmãs pelo `asaas_payment_id`.
12. **O gate de bloqueio vale para a equipe inteira** via RPC definer (`0131:24-57`), sem vazar `cpf_cnpj`/`asaas_*` para barbeiro (`useAssinatura.ts:70-84`).

---

## 3. O que está errado ou incompleto

### 3.1 ALTO — Recorrências e clientes órfãos no Asaas depois da produção zerada; a El Guardians de R$ 5/mês não é mais alcançável pelo sistema

- **Evidência:** `docs\estado-do-projeto.md:50` e `docs\backlog.md:351-360` ("⚠️ ABERTO: El Guardians cobra R$ 5,00 por mês no Asaas… Conserto: Assinatura → Cancelar"). Mas a produção foi zerada em 03/09 (`backlog.md:2024-2028`) e o SELECT de hoje mostra a El Guardians **recriada em 04/09 com `asaas_subscription_id = NULL`** — o botão Cancelar só remove recorrência quando essa coluna está preenchida (`asaas/index.ts:196-200`). O conserto documentado **deixou de existir**. Idem a recorrência da antiga Curitiba (`sub_klx4z6d0xv9p83h4`, `backlog.md:362-375`): o salão foi apagado, nenhuma linha aponta para ela. E ficaram 2 clientes órfãos no Asaas (`cus_000192278757`, `cus_000194207151` — `backlog.md:2043`).
- **Impacto prático:** se essas recorrências ainda existirem no Asaas, **geram cobrança real todo mês** (R$ 5 a El Guardians todo dia 19) contra pagadores que o sistema não conhece; o webhook responderia `assinatura nao encontrada` (200, ignorado) e nada apareceria no CRM. Dinheiro e ruído contábil sem dono.
- **Correção sugerida (não aplicada):** inventariar no **painel do Asaas** todas as subscriptions e customers ativos e cancelar/arquivar à mão o que não tem espelho no banco; registrar no backlog a regra "zerar banco exige zerar Asaas junto".

### 3.2 ALTO — Inadimplência não fala com ninguém: sem retry, sem lembrete, e o pagante no Asaas nasce sem e-mail

- **Evidência:** `PAYMENT_OVERDUE` apenas marca `status='atrasada'` (`asaas-webhook/index.ts:254-256`); nenhum workflow n8n de cobrança vencida existe (lista completa de 13 workflows conferida — só "Aviso de Fim de Teste", que cobre trial: `Dz35hJOz7UJER1Ll`). O cliente é criado no Asaas **só com `name`, `cpfCnpj` e `externalReference`** (`cobrar-uso/index.ts:173-176`) — sem e-mail/telefone, o próprio Asaas não tem para onde mandar as notificações de vencimento dele.
- **Impacto prático:** depois do único e-mail de boleto (n8n), o silêncio: o dono que perdeu o e-mail só descobre a dívida no banner do CRM ou quando bloqueia (`estende-acesso-sem-debito` para de estender no dia seguinte ao vencimento do boleto). Inadimplência vira churn evitável.
- **Correção sugerida:** incluir o e-mail do dono (`email_do_dono`, `0099:45-58`) no `POST /customers` — o Asaas passa a mandar os lembretes dele —, e/ou um workflow n8n de "boleto vencido há N dias" na mesma fila (`faturas_de_uso` com `boleto_vencimento < hoje` e `paga_em is null`).

### 3.3 MÉDIO — Fallback silencioso para sandbox em `asaas` e `asaas-webhook`

- **Evidência:** `asaas/index.ts:31` e `asaas-webhook/index.ts:7`: `ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com'`. O próprio projeto já concluiu que isso é errado: `cobrar-uso/index.ts:30-31` ("Sem fallback de propósito: sandbox silencioso em produção é pior que falhar").
- **Impacto prático:** com a env ausente/apagada num redeploy, o cancelamento de recorrência legada passa a falar com o sandbox. O pior caso concreto: o sandbox devolvendo **404** para um id de produção é tratado como sucesso (`asaas/index.ts:53`), o banco marca `cancelada` e limpa `asaas_subscription_id` — e a recorrência real continua cobrando.
- **Correção sugerida:** replicar o padrão do `cobrar-uso` nas duas funções (sem fallback; falhar com 500 e log).

### 3.4 MÉDIO — Evento fora de ordem: `PAYMENT_OVERDUE` chegando depois do pagamento marca "atrasada" mesmo com a conta paga

- **Evidência:** o ramo de atraso não confere `faturas_de_uso.paga_em` nem `acesso_ate` antes de escrever `status='atrasada'` (`asaas-webhook/index.ts:210` para rede, `:256` para unidade). A idempotência protege contra o **mesmo** evento repetido, não contra ordem invertida de eventos **diferentes** do mesmo pagamento (entrega at-least-once não garante ordem).
- **Impacto prático:** as datas não mudam (correto), mas a tela passa a dizer "Cobrança em atraso" (`AssinaturaPage.tsx:58-71`) para quem pagou — até o próximo pagamento sobrescrever o status. Suporte e desconfiança.
- **Correção sugerida:** no ramo de atraso, ignorar o evento se a cobrança (`payment.id`) já tem `paga_em`, ou se um evento `PAGOU` do mesmo `payment.id` já está em `asaas_eventos`.

### 3.5 MÉDIO — A nota do n8n diz que "o token anon basta" para o `cobrar-uso`, mas o código exige a service key — e o nó engole o 401 em silêncio

- **Evidência:** nó **Gerar Boletos** do workflow `8Qh33uoFm4VqT1eO` (nota do nó: "por isso o gatilho aceita o token anon"; mesma frase em `docs\backlog.md:1418`) contra `cobrar-uso/index.ts:70-81`, que desde a revisão de 29/08 recusa qualquer coisa que não seja a service key. O nó está com `onError: continueRegularOutput` — um 401 permanente não quebraria execução nenhuma.
- **Impacto prático:** se a credencial `supabaseApi` daquele nó for a anon key, **nenhuma cobrança jamais nasce** e as execuções continuam "success". Evidência indireta de que hoje está certa: os nós Supabase do mesmo fluxo leem `faturas_a_notificar`/`boletos_a_enviar`, cujo grant é só `service_role` (`0099:79,107`), e as 282 execuções são `success` — a credencial dos nós Supabase enxerga views de service_role. Mas o nó HTTP pode apontar para **outra** credencial, e isso o MCP não mostra (ver §6).
- **Correção sugerida:** corrigir a nota do nó e o backlog; conferir a credencial no editor do n8n; considerar alarme quando `cobrar-uso` responder ≠200.

### 3.6 MÉDIO — A promessa "boleto, Pix ou cartão" com Pix e boleto bloqueados na conta

- **Evidência:** `docs\estado-do-projeto.md:48-49` ("Pix e boleto bloqueados na conta do Asaas… Hoje só cartão recebe"). O `cobrar-uso` emite `billingType:'UNDEFINED'` (`:212-214`) e os textos prometem escolha: e-mail do boleto ("Pagar agora (boleto, Pix ou cartão)", nó Montar Email do Boleto) e `docs\backlog.md:1411`.
- **Impacto prático:** o dono clica esperando Pix/boleto e encontra só cartão — para o público de barbearia, atrito direto na conversão do pagamento.
- **Correção sugerida:** enquanto a análise do Asaas não liberar, ajustar o texto dos e-mails/CRM para "cartão (Pix e boleto em breve)" — e reverter quando liberar (ver §6).

### 3.7 MÉDIO — Documentação oficial descreve o modelo morto e um conserto que não funciona mais

- **Evidência:** `docs\estado-do-projeto.md` (atualizado 2026-08-16) lista "Cobrança | assinar, pagar, trocar de plano com rateio, cancelar, bloquear" (`:26`) e "Lembrete… só no Pro, via `salons_com_automacao`" (`:25`) — mas troca de plano/rateio não existem (`asaas/index.ts:4-11`, `0110`), e `salons_com_automacao` desde a `0131:76-88` não filtra por plano nenhum (o gating Pro/Básico morreu; a view hoje é só janela de acesso). O conserto da El Guardians no backlog aponta para um botão que não alcança mais a recorrência (achado 3.1).
- **Impacto prático:** qualquer pessoa (ou auditoria, como esta) que parta dos docs audita/decide sobre um sistema que não existe.
- **Correção sugerida:** uma passada em `estado-do-projeto.md` e nos itens ⚠️ do backlog marcando o que o modelo por uso invalidou.

### 3.8 BAIXO — `ajustarRecorrencia` é código morto no webhook

- **Evidência:** definida em `asaas-webhook/index.ts:48-63`, nunca chamada (a troca de plano que a usava morreu — comentário nas `:151-153`). Confirmado no código deployado (v21).
- **Impacto prático:** ruído; e é o único lugar do webhook que ainda falaria com a API do Asaas (com o fallback sandbox do 3.3).
- **Correção sugerida:** apagar a função e as envs que só ela usa no webhook.

### 3.9 BAIXO — `somarUmMes` estoura o fim do mês

- **Evidência:** `asaas-webhook/index.ts:36-40` usa `setUTCMonth(+1)`: `2026-01-31` + 1 mês = `2026-03-03` (rollover do JS).
- **Impacto prático:** boleto com vencimento em 29–31 dá 1–3 dias de acesso de graça. Centavos, a favor do cliente.
- **Correção sugerida:** clampar para o último dia do mês seguinte.

### 3.10 BAIXO — Comparação do token do webhook não é em tempo constante

- **Evidência:** `asaas-webhook/index.ts:78` usa `!==`; o `cobrar-uso/index.ts:70-77` faz a comparação byte a byte em tempo constante.
- **Impacto prático:** timing attack por rede é impraticável aqui; é inconsistência de padrão, não exposição real.
- **Correção sugerida:** reutilizar a mesma comparação constante.

---

## 4. O que ainda não quebrou mas vai virar problema em produção

1. **Corrida no `cobrar-uso`.** Duas execuções simultâneas (cron do n8n + disparo manual/retry) podem ambas ler a mesma fatura sem `asaas_payment_id` e criar **duas cobranças** no Asaas; a segunda gravação sobrescreve a primeira, que fica órfã — e se o cliente pagar a órfã, o webhook estende o acesso pelo `externalReference` mas nenhuma fatura ganha `paga_em` (o update é por `asaas_payment_id`, `asaas-webhook/index.ts:143-149`). Hoje o risco é baixo (um agendador só, execuções de <1s); com retries e mais volume, aparece. Um lock (`select … for update skip locked`) ou constraint resolveria.
2. **O acesso de todo pagante em dia depende de um cron diário.** `estende-acesso-sem-debito` roda 1x/dia (`0130:281-285`); se o pg_cron falhar em silêncio por alguns dias, barbearias sem dívida nenhuma começam a bloquear (o `acesso_ate` fica para trás). Não há monitoramento de execução dos crons.
3. **Relógios diferentes na régua de corte.** A RPC usa data de São Paulo; as views `salons_atendendo`/`salons_com_automacao` usam `current_date` (UTC) — a própria `0131:37-41` documenta a divergência de horas em volta da meia-noite. Com clientes reais, é a diferença entre "a tela diz que atende" e "o agente já parou".
4. **`email_do_dono` escolhe um dono só** (o mais antigo — `0099:52-57`). Barbearia com dois donos: o boleto vai para uma caixa única; se ela for a abandonada, ninguém vê.
5. **Apagar barbearia/banco não apaga nada no Asaas.** Já produziu 2 customers e (provavelmente) 2 recorrências órfãs numa única limpeza (`backlog.md:2037-2043`). A cada churn ou reset isso acumula — e órfão no Asaas é cobrança que ninguém está olhando.
6. **Acúmulo abaixo de R$ 5 sem teto.** Barbearia que gera R$ 1,50/mês nunca é cobrada e nunca bloqueia (por desenho — `0130:263-270`). Em escala, uma cauda de micro-uso permanentemente gratuita; vale ao menos medir.
7. **E-mail é o único canal da cobrança**, saindo de `castrocollin01@gmail.com` via SMTP (nós de e-mail do workflow), com entrega testada só no Gmail (`estado-do-projeto.md:47`). Um boleto que cai em spam = achado 3.2 na prática.
8. **Precedente do `externalReference`.** Cobrança avulsa criada à mão no painel com `externalReference = salon_id` casa no fallback do webhook e dá um mês de acesso (`asaas-webhook/index.ts:216-251`; o próprio backlog registra o quase-acidente, `:346-349`). Regra operacional: cobrança manual no painel nunca leva `externalReference` de salão, ou leva um prefixo que o webhook ignore.

---

## 5. Interfaces: o que ENTREGA e o que CONSOME

### Entrega (contratos expostos)

| Contrato | Nome exato | Detalhe |
|---|---|---|
| Webhook de pagamento | `POST https://bukhpvvybeltmhtwamox.supabase.co/functions/v1/asaas-webhook` | `verify_jwt=false`; auth pelo header **`asaas-access-token`** = env `ASAAS_WEBHOOK_TOKEN`. Consome do corpo: `id`, `event`, `payment.id`, `payment.subscription`, `payment.dueDate`, `payment.externalReference`. Eventos com efeito: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_RECEIVED_IN_CASH` (liberam), `PAYMENT_OVERDUE` (marca atraso); o resto → 200 ignorado. |
| Ações do cliente | `POST /functions/v1/asaas` | JWT do usuário no `Authorization`. Corpo: `{acao:'cancelar', salonId}` \| `{acao:'unificar-rede'\|'separar-rede', organizationId, cpfCnpj?}`. |
| Gatilho de emissão | `POST /functions/v1/cobrar-uso` | `Authorization: Bearer <service role key>` (exclusivo). Resposta: `{cobrancas, faturasCobertas, acumuladas, semDocumento}`. |
| Situação do acesso | RPC `public.situacao_do_acesso(p_salon_id)` | → `status, acesso_ate, atendimento_ate, bloqueado, atendendo` (qualquer vínculo da unidade). |
| Medidor do mês | view `public.uso_do_sistema_no_mes` | dashboard do dono. |
| Histórico/boletos no CRM | tabela `public.faturas_de_uso` (SELECT do dono) | campos-chave: `valor`, `boleto_url`, `boleto_vencimento`, `boleto_valor`, `paga_em`, `detalhe`. |
| Documento do pagante | `public.subscriptions.cpf_cnpj` | UPDATE direto do dono (grant por coluna). |
| Filas do n8n | views `public.faturas_a_notificar`, `public.boletos_a_enviar` (só service_role) | n8n devolve `faturas_de_uso.notificada_em` e `boleto_notificado_em`. |
| Gate de atendimento | views `public.salons_atendendo`, `public.salons_com_automacao` | consumidas pelos fluxos de WhatsApp do n8n. |

### Consome

| De quem | Nome exato |
|---|---|
| Asaas API | `POST /v3/customers`, `POST /v3/payments`, `DELETE /v3/payments/{id}` (cobrar-uso); `DELETE /v3/subscriptions/{id}` (asaas, legado). Auth pelo header `access_token`. Base pela env `ASAAS_BASE_URL`. |
| Envs (nomes; valores não lidos) | `ASAAS_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| pg_cron (confirmados ativos) | `fechamento-mensal-de-uso` (`0 9 1 * *` → `fechar_mes_de_uso()`), `estende-acesso-sem-debito` (`20 4 * * *` → `estender_acesso_sem_debito()`) |
| n8n | workflow `CRM Salao - Detalhamento de Uso` (`8Qh33uoFm4VqT1eO`), Schedule de hora em hora; credencial `supabaseApi` (nome da credencial, valor não visto) |
| Banco | `subscriptions`, `faturas_de_uso`, `faixas_de_uso`, `asaas_eventos`, `organizations` (`cobranca_unificada`, `cpf_cnpj`, `asaas_customer_id`, `asaas_subscription_id`), `salons`, `user_salons`; RPCs `gerar_fatura_de_uso`, `gerar_fatura_de_cancelamento`, `preco_por_uso`, `email_do_dono` |

---

## 6. NÃO VERIFICADO

Tudo abaixo exige o **painel do Asaas** ou valores de credencial, que esta auditoria não acessa por regra.

1. **Se a recorrência El Guardians (R$ 5/mês) ainda existe e está ativa no Asaas** — e a antiga `sub_klx4z6d0xv9p83h4` da Curitiba. O banco não guarda mais nenhum id delas (SELECT: `asaas_subscription_id` nulo; 0 organizations). *O dono precisa: painel Asaas → Assinaturas → cancelar o que não tiver espelho no banco.*
2. **Os clientes órfãos `cus_000192278757` e `cus_000194207151`** (citados em `backlog.md:2043`): se existem e se têm cobranças penduradas.
3. **Configuração do webhook no painel do Asaas**: URL apontando para `/functions/v1/asaas-webhook`, token igual ao secret `ASAAS_WEBHOOK_TOKEN`, eventos assinados, e **se a fila está pausada** (15 falhas seguidas pausam). Não há como ver do lado de cá; `asaas_eventos` está vazia desde a limpeza, então nem tráfego recente existe como evidência.
4. **Valores dos secrets das edge functions** (`ASAAS_BASE_URL` = produção ou sandbox; `ASAAS_API_KEY` de produção; `ASAAS_WEBHOOK_TOKEN` presente): não lidos por regra. O caminho de venda com dinheiro real de 16/08 (`estado-do-projeto.md:17-19`, `historico.md:393`) indica que estavam certos **naquela data, no modelo antigo** — não prova o estado de hoje.
5. **Qual credencial o nó HTTP "Gerar Boletos" usa** (anon vs service role) — o n8n não expõe o valor. Evidência indireta favorável (item 3.5), mas a confirmação é abrir a credencial no editor do n8n ou disparar o nó e olhar o status HTTP.
6. **Status da análise de Pix/boleto na conta Asaas** (`estado-do-projeto.md:48-49`) e o **saldo** da conta.
7. **O ciclo por uso nunca rodou ponta a ponta com dinheiro real.** O teste real de 16/08 foi no modelo de assinatura, hoje morto. No modelo vigente: 0 faturas, 0 cobranças, 0 eventos de webhook (SELECTs). O primeiro fechamento real (dia 1º) será a primeira execução de verdade de `fechar_mes_de_uso` → `cobrar-uso` → e-mail → pagamento → webhook em produção. *O dono precisa: acompanhar o primeiro ciclo com um caso real (a El Guardians sai do teste em 11/09).* 
8. **Entrega dos e-mails de cobrança fora do Gmail** (`estado-do-projeto.md:47`).

---

**Placar:** CRÍTICO: 0 · ALTO: 2 · MÉDIO: 5 · BAIXO: 3
