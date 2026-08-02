## As cinco peças — pensar em todas, sempre

Este projeto não é só o app React. Toda mudança — correção, feature, ajuste —
precisa ser mapeada **antes de começar** nas cinco peças abaixo, dizendo
explicitamente o que muda em cada uma, inclusive "nada" quando for o caso.

| Peça | O que costuma exigir |
|---|---|
| **CRM** (React/Vite) | telas, rotas, permissão por papel (`RequireManager`, `RequireNetworkOwner`) |
| **Supabase** | migration, RLS, RPC, edge function — e **aplicar em produção à mão**, porque migration não está no pipeline de deploy |
| **Vercel** | variável de ambiente nova exige **redeploy**: o Vite embute o valor em build time |
| **GitHub** | commit e push; é o gatilho do deploy, e o CI roda typecheck, lint, vitest e pgTAP |
| **n8n** | o agente de WhatsApp. **Nenhuma automação que fale com o cliente existe sem passar por aqui** |

Ao terminar uma parte, declarar o que ficou pendente nas outras. O que depender
de peça fora do repositório (n8n, painel da Vercel, painel do Supabase) vai para
`docs/backlog.md`, senão some do radar.

**Por que isso existe:** a aba Marketing foi construída inteira no CRM e só no
fim ficou claro que o envio, o opt-out (requisito de LGPD) e a leitura das
ofertas pelo agente dependem todos do n8n — trabalho que não estava no plano.
Entregar metade da funcionalidade numa peça e descobrir a outra metade depois
gera retrabalho e dá falsa sensação de pronto.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
