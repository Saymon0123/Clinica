# WhatsApp — onde paramos e como retomar

**Congelado em 2026-08-21.** A migração da Evolution para a Cloud API oficial
está construída, mas **parada em duas filas de análise da Meta**. Nada aqui
depende de código: depende de aprovação.

Este documento existe para que, ao voltar, ninguém precise reconstruir o
raciocínio — só ler e continuar.

---

## Por que parou

O teste de ponta a ponta exige um número real registrado. Descobrimos em
2026-08-21 que **a coexistência não está disponível para a nossa conta**, e a
documentação da Meta é explícita:

> "You must already be a Solution Partner or Tech Provider to configure this
> flow."
> — [Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)

A cadeia é serial:

```
Verificação da empresa  →  Tech Provider  →  Embedded Signup  →  coexistência
```

**O painel comum não oferece coexistência.** O botão *Adicionar novo número*
(Casos de uso → Conectar no WhatsApp → Etapa 2) leva **só** à migração completa:
oferece SMS ou ligação, e avisa que o número precisa ser desconectado da conta
WhatsApp existente. Quem passa por ali **perde o WhatsApp Business do celular**.

Isso não serve para barbearia: o barbeiro vive com o telefone na mão. Por isso a
coexistência é a escolha certa, e por isso esperamos.

**A decisão tomada:** aguardar a verificação da empresa e testar direto em
produção, em vez de comprar um chip só para destravar o teste.

---

## O que já está pronto e no ar

| Peça | Estado |
|---|---|
| Edge function `whatsapp-webhook` | **v6, ativa**, `verify_jwt: false` |
| Validação HMAC `X-Hub-Signature-256` | tempo constante, sempre responde 200 |
| Tradução número → barbearia | RPC `salon_por_phone_number_id`, devolve NULO para número desconhecido |
| Áudio, imagem, vídeo, documento | passam `media_id` ao n8n, que baixa e transcreve |
| Fluxo do agente (`rJO1n7cFeNDIJyB5`) | migrado para nós nativos do WhatsApp, publicado |
| Lembrete a 1h30 com botões | RPC `responder_lembrete` testada nos 4 casos |
| 6 views pela `conexoes_ativas` | migrations 0088 e 0089 |
| Alertas internos por e-mail | migrations 0090–0092, testado com envio real |
| 24 templates catalogados | tabela `whatsapp_templates`, todos em `rascunho` |

**Nada envia com `status <> 'aprovado'`.** As views já filtram por isso, então o
sistema está seguro parado: não vai disparar nada errado enquanto espera.

---

## Dados que você vai precisar

| | |
|---|---|
| App ID | `1054189290929803` |
| El Guardians (`salon_id`) | `e1705efb-944f-4083-925d-fe5d742bfbb4` |
| `phone_number_id` atual | `1299462689911188` — **é o número de TESTE** |

O número de teste é **só de saída**, com no máximo 5 destinatários cadastrados à
mão, e o painel que cadastra esses destinatários falhou em todas as tentativas.
Número de produção **não tem lista de autorizados** — tem o limite de 250
destinatários únicos por 24h, que a verificação da empresa eleva para 100 mil.

Ao registrar o número real, trocar no banco:

```sql
update whatsapp_connections
   set phone_number_id = '<novo>'
 where salon_id = 'e1705efb-944f-4083-925d-fe5d742bfbb4';
```

---

## Fila 1 — Meta (esperando análise)

### 1.1 Verificação da empresa
**O item mais lento, e o que destrava mais coisa.** Eleva o limite de 250 para
100 mil destinatários **e** é a base do Tech Provider.

O tempo não é decidido pela fila, e sim por quantas idas e vindas os documentos
dão: nome que não bate exatamente com o registro, endereço divergente, documento
fora do prazo. Cada rejeição reinicia a espera.

### 1.2 Tech Provider
Iniciado em 2026-08-21. Opção correta: **Independent Tech Provider** — a outra
(*Working with a Solution Partner*) é para quem constrói sobre um BSP e precisa
informar o app ID dele. Análise do app é obrigatória nas duas.

### 1.3 Aprovação dos templates
**O gargalo do produto, e independente das outras duas.** Sem template aprovado
não existe lembrete nem reativação na API oficial — não é que fiquem piores, é
que não podem sair.

Submeter **`lembrete_hoje` primeiro e sozinho**, e conferir que categoria a Meta
aplicou antes de mandar o resto. Se voltar como *marketing*, alguma palavra
contaminou — é muito mais barato descobrir num template do que em vinte e quatro.

Depois de aprovado, registrar no banco:

```sql
update whatsapp_templates
   set status = 'aprovado', categoria_meta = 'utility', atualizado_em = now()
 where chave = 'lembrete_hoje';
```

A view `templates_recategorizados` mostra onde a Meta discordou do que pedimos —
cada linha ali é custo ~9x maior que o previsto.

---

## Fila 2 — trabalho nosso, destravado pela Fila 1

### 2.1 Envio do lembrete (depende de 1.3)
Trocar `Enviar WhatsApp (Lembrete)` do fluxo `DW0nq1Jyp9xeOJwm` pelo nó nativo
com `sendTemplate`, e **gravar o `wamid` devolvido** em
`appointments.lembrete_message_id`.

**Sem esse segundo passo o clique do cliente nunca é reconhecido** — a RPC
`responder_lembrete` casa pelo wamid, e ele não existirá.

### 2.2 Fluxo determinístico da resposta (depende de 1.3)
Fluxo novo no n8n, sem agente nenhum, que recebe da edge function e só entrega o
texto que veio decidido do banco, registrando em `whatsapp_messages`.

Precisa do segredo `N8N_LEMBRETE_RESPOSTA_URL` no Supabase. **Sem ele o banco é
atualizado mas o cliente confirma e fica no vazio.**

### 2.3 Embedded Signup no CRM (depende de 1.2)
É a automação do cadastro de barbearia. Só começa depois do app aprovado — sem
isso não há como testar de verdade.

### 2.4 Não depende de nada — pode ser feito a qualquer momento

- **Tela `/conexao` ainda mostra QR da Evolution.** É a única mentira visível no
  produto: um dono novo abre e vê um caminho que não existe mais. Mostrar o
  estado real pela `conexoes_ativas`.
- **Três fluxos ainda na Evolution:** `Aviso de Fim de Teste` (ativo),
  `Política de Atraso` (desligado) e o envio dos lembretes.
- **Código morto que ainda funciona e pode ser chamado por engano:** edge
  function `whatsapp`, `_shared/instanceName.ts`, `_shared/evolutionConfig.json`,
  `scripts/evolution-*.mjs`.

---

## Armadilhas já pagas — não repetir

**O painel da Meta mente calado.** A Etapa 1 insistiu "Nenhum número de telefone
disponível" por mais de quatro cliques enquanto a Graph API listava o número em
632 ms. Quando o painel recusar sem explicar, **perguntar à Graph API antes de
mudar qualquer configuração**.

**O app precisa ser criado pelo fluxo novo.** O modal "nova maneira de criar
apps" é uma bifurcação: o botão azul vai para o sistema novo; fechar no X cria um
app **sem tipo**, que nunca consegue receber WhatsApp. O app `2289927998418576`
foi perdido assim.

**O app precisa estar publicado.** Em modo de desenvolvimento o webhook de
produção não entrega.

**Token gerado no System User errado** devolve "Nenhuma permissão disponível" —
foi o *Conversions API System User*, que não tem o app.

**Mídia não chega com conteúdo.** Áudio e imagem chegam como `media_id`; ouvir
exige `mediaUrlGet` e depois baixar com o token, e a URL expira em minutos. Uma
versão anterior do webhook descartava tudo que não fosse texto — teria feito
metade das mensagens sumirem em silêncio.

**Template é aprovado por WABA**, não por app.

**Desde 2025-04-09 a Meta não recusa por categoria errada** — ela aprova como
*marketing*, que custa ~9x mais. E recategoriza template já aprovado.

---

## Retomando: a ordem

1. Verificação da empresa aprovada → registrar o número real da El Guardians
2. `lembrete_hoje` aprovado → 2.1 e 2.2, e aí o lembrete funciona de ponta a ponta
3. Tech Provider aprovado → 2.3, e o cadastro de barbearia deixa de ser SQL na mão
4. Com o teste passando, submeter os 23 templates restantes
5. Aposentar a Evolution (2.4)

O item 2 é o que faz o produto funcionar. O item 3 é o que faz ele escalar. Não
são a mesma urgência.
