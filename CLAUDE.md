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

## A régua: caminhos, design e verdade

Três regras que valem para **tudo** neste projeto — analisar, criar, mudar.
A versão longa, com o checklist inteiro, está na skill `olhar-critico`
(`.claude/skills/olhar-critico/SKILL.md`). Estas três linhas são a versão
curta, que nunca deixa de ser lida.

1. **Os caminhos que ninguém previu.** Não parar no fluxo que dá certo.
   Percorrer o que a pessoa faz quando quer outro momento, outra opção, mudar
   de ideia, chegar por outra porta, ou não fazer nada — e o que o outro lado
   enxerga quando isso acontece. Vale para o cliente final e para o dono.
   Ao entregar, dizer quais caminhos foram cobertos e quais ficaram de fora.

2. **O design da página, não só a função.** Hierarquia, os quatro estados
   (carregando, vazio, erro, cheio), celular primeiro, claro e escuro, e os
   tokens que já existem em vez de cor solta. Funcionar não é estar pronto.

3. **A verdade, não o agrado.** Ruim é ruim, dito na cara com o motivo. Bom é
   bom, sem defeito inventado para parecer rigoroso. Discordar antes de fazer,
   não depois. Separar o que foi verificado do que foi deduzido.

**Por que isso existe:** a agenda pública passou na vistoria de funcionamento
e só depois ficou claro que quem abre o link às 23h bate num muro, que o
cliente não recebe confirmação nenhuma, e que o recurso nem vem ligado numa
barbearia nova. O fluxo feliz funcionava. Ele quase sempre funciona, e por
isso não prova nada.
