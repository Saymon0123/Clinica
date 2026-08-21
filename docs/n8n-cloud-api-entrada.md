# Fluxo n8n — entrada da Cloud API

**Criado e publicado em 2026-08-21.**

- Fluxo: `CRM Salao - WhatsApp Cloud API (entrada)`, id `5PU5WhmMgfGht0pr`
- URL de produção: `https://n8n-m5uf.srv1833354.hstgr.cloud/webhook/whatsapp-cloud`

É essa URL que vai no segredo `N8N_WHATSAPP_WEBHOOK_URL` do Supabase.

---

## O desenho

```
Mensagem da Edge Function → Tem Mídia?
                              ├── não → Texto Final (Texto) ─┐
                              └── sim → Buscar URL da Mídia  │
                                        → Baixar Mídia       │
                                        → Transcrever OpenAI │
                                        → Texto Final (Áudio)┤
                                                             ↓
                                              AQUI ENTRA O AGENTE
                                                             ↓
                                              Responder pela Cloud API
```

**Nenhuma verificação de inquilino aqui, de propósito.** A edge function já
conferiu a assinatura HMAC e traduziu o número para `salon_id`. Repetir a
checagem criaria duas versões da mesma regra, e um dia elas discordariam.

## Por que existe o ramo de áudio

Na Evolution o áudio chegava resolvido. **Na Cloud API não**: vem um `media_id`,
e ouvir exige duas chamadas — uma para descobrir a URL, outra para baixar o
arquivo, ambas com o token no cabeçalho.

A URL da mídia **vence em poucos minutos**, então baixar e transcrever têm que
acontecer na mesma execução. Não dá para guardar o link e resolver depois.

Cliente de barbearia manda áudio o tempo todo — sem este ramo, metade das
mensagens sumiria.

## O que ainda é provisório

**O nó `AQUI ENTRA O AGENTE`** hoje só devolve `"Recebi: " + texto`. Ele existe
para provar o caminho de ida e volta, não para conversar.

O agente de verdade é o `rJO1n7cFeNDIJyB5`, que tem o prompt, as oito
ferramentas e a montagem de contexto. Trocar o nó por ele é o próximo passo —
e **só depois disso este fluxo pode falar com cliente real**.

## Falta preencher, no n8n

Duas credenciais foram criadas vazias:

| Credencial | O que é |
|---|---|
| **Meta Graph API** | Header `Authorization` = `Bearer <token permanente do usuário do sistema>` |
| **OpenAI Bearer** | Header `Authorization` = `Bearer <chave da OpenAI>` |

Usadas em quatro nós: Buscar URL da Mídia, Baixar Mídia, Transcrever com
OpenAI e Responder pela Cloud API.

## O que já foi verificado

Execução 8670, com dados simulados: mensagem de texto entra, sai pelo ramo sem
mídia, chega ao nó do agente com `texto`, `contact_phone`, `phone_number_id` e
`salon_id` corretos, e monta a resposta. O envio ficou pinado — não tocou na
Meta.

## A cadeia completa, e onde ela para hoje

| | Estado |
|---|---|
| Meta → edge function | ✅ testado, assinatura confere |
| edge function → n8n | ⬜ falta o segredo `N8N_WHATSAPP_WEBHOOK_URL` |
| n8n → transcrição | ⬜ falta a credencial da OpenAI |
| n8n → agente | ⬜ nó provisório |
| n8n → Meta | ⬜ falta a credencial Meta Graph API |
| app publicado | ⬜ sem isso, mensagem real não chega |
