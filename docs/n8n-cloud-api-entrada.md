# Migração do agente para a Cloud API

**Feita em 2026-08-21, no próprio fluxo principal.**

- Fluxo: `CRM Salão - Atendimento WhatsApp (Supabase Nativo)`, id `rJO1n7cFeNDIJyB5`
- Estado: **alterações no rascunho, ainda não publicadas** — falta a credencial

---

## Por que no fluxo existente, e não num novo

A primeira tentativa criou um fluxo paralelo (`5PU5WhmMgfGht0pr`, arquivado).
Foi decisão errada, e o dono do produto apontou: os 65 nós do fluxo original —
o agente, as oito ferramentas, o catálogo, o calendário, o histórico, a espera
de sequência — **são todos agnósticos de provedor**. Eles falam com o Supabase,
não com o WhatsApp.

Um fluxo paralelo significaria duplicar tudo aquilo, ou manter **dois cérebros**
— exatamente o problema das "duas verdades" que este projeto evita em todo
lugar. Só três coisas mudam entre Evolution e Cloud API: a entrada, a mídia e
o envio.

## Por que os nodes nativos, e não HTTP na mão

O n8n tem `n8n-nodes-base.whatsApp` com `media/mediaUrlGet` e `message/send` —
e também `message/sendTemplate`, que é o que a parte 2 vai precisar para o
lembrete com botões. Montar aquele JSON à mão seria trabalho jogado fora.

## O que mudou, e só

| Nó | Antes | Depois |
|---|---|---|
| `Webhook Evolution API` | — | renomeado para **Webhook da Edge Function** (mesmo path `salao-atendimento`) |
| `Normalizar Payload` | lia `remoteJid`, `pushName`, `base64` | lê o payload plano da edge function |
| `Buscar Instância Conectada` | filtrava por `instance_name` | filtra por **`phone_number_id`** |
| `Extrair Salon ID` | repassava `audio_base64` | repassa **`media_id`** e `phone_number_id` |
| áudio | base64 vinha pronto | **Buscar URL do Áudio → Baixar → Transcrever** |
| imagem | base64 vinha pronto | **Buscar URL da Imagem → Baixar → Descrever** |
| envio (2 nós) | HTTP para a Evolution | **node nativo `whatsApp`** |

**Tudo entre `Converge Texto Final` e `Inserir Mensagem do Agente` ficou
intacto** — agente, prompt, ferramentas, contexto.

## A mídia é a diferença real

Na Evolution o áudio chegava em base64, resolvido. Na Cloud API vem um
`media_id`, e ouvir exige duas chamadas: `mediaUrlGet` para descobrir a URL, e
um GET para baixar o arquivo. **A URL vence em poucos minutos** e exige o token
no cabeçalho, então baixar e transcrever têm que acontecer na mesma execução.

O nó de transcrição também mudou: antes mandava a string base64 no campo `file`
de um multipart; agora manda o **binário** (`formBinaryData`), que é o que a
OpenAI espera.

## Verificação estrutural

Feita em 2026-08-21, sobre o rascunho:

- **53 nós alcançáveis** a partir do webhook; **nenhum órfão**
- os quatro nós nativos de WhatsApp estão na cadeia
- `phone_number_id` e `media_id` são produzidos em `Normalizar Payload`,
  repassados por `Extrair Salon ID`, e chegam a `Converge Texto Final` porque
  todos os `Texto Final (*)` têm `includeOtherFields: true`
- varredura por `evolution-api`, `remoteJid`, `audio_base64`, `image_base64`,
  `instance_name` e `pushName`: **zero ocorrências**

## O que falta para publicar

O n8n **recusou a publicação** — e fez certo:

```
Node "Buscar URL do Audio":  Credential not configured: whatsAppApi
Node "Buscar URL da Imagem": Credential not configured: whatsAppApi
Node "Responder pela Cloud API": Credential not configured: whatsAppApi
Node "Responder Padrao pela Cloud API": Credential not configured: whatsAppApi
```

Enquanto isso, **a versão ativa continua sendo a antiga**, e nada quebrou.

Falta criar no n8n:

| Credencial | Tipo | Conteúdo |
|---|---|---|
| **WhatsApp Cloud API** | `whatsAppApi` | token permanente do usuário do sistema + Business Account ID |
| **Meta Graph API** | `httpHeaderAuth` | `Authorization: Bearer <mesmo token>` — usada nos dois downloads |

Depois: publicar o fluxo, e criar o segredo `N8N_WHATSAPP_WEBHOOK_URL` no
Supabase apontando para
`https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/salao-atendimento`.
