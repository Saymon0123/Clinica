# Club Cut — CRM e atendimento por WhatsApp para barbearia

Quem usa é o **dono** da barbearia, o **barbeiro** (vê menos: a própria comissão,
não o faturamento) e o **cliente final**, que nunca faz login — ele chega pelo
WhatsApp ou pelo link público da agenda. Escrever para essas três pessoas, e não
para quem programa, é o que decide quase toda dúvida de interface aqui.

## As cinco peças — pensar em todas, sempre

Este projeto não é só o app React. Toda mudança — correção, feature, ajuste —
precisa ser mapeada **antes de começar** nas cinco peças abaixo, dizendo
explicitamente o que muda em cada uma, inclusive "nada" quando for o caso.

| Peça | O que costuma exigir |
|---|---|
| **CRM** (React/Vite) | telas, rotas, permissão por papel (`RequireManager`, `RequireNetworkOwner`) |
| **Supabase** | migration, RLS, RPC, edge function — e **aplicar em produção à mão**, porque migration não está no pipeline de deploy |
| **Vercel** | variável de ambiente nova exige **redeploy**: o Vite embute o valor em build time |
| **GitHub** | commit e push; é o gatilho do deploy, e o CI roda typecheck, lint, vitest, pgTAP, gitleaks, `npm audit` e CodeQL |
| **n8n** | o agente de WhatsApp. **Nenhuma automação que fale com o cliente existe sem passar por aqui** |

Ao terminar uma parte, declarar o que ficou pendente nas outras. O que depender
de peça fora do repositório (n8n, painel da Vercel, painel do Supabase) vai para
`docs/backlog.md`, senão some do radar.

**Por que isso existe:** em 21/09 o pedido foi "o cliente lembra da sobrancelha
dez minutos depois de marcar e não consegue adicionar pelo WhatsApp". Parecia
tela. Era uma RPC nova no banco (a régua de quando cabe), três ferramentas no
n8n, uma ação na edge function e só então o CRM — e nada disso funcionaria pela
metade. Antes dele, a aba Marketing foi construída inteira no CRM e só no fim
ficou claro que envio, opt-out (LGPD) e leitura das ofertas dependiam todos do
n8n; ela acabou removida no "Reduz o projeto ao escopo da v1", e a lição ficou.

## O terreno, hoje

O projeto é maduro e grande: quase duzentas migrations, dezenas de arquivos de
teste pgTAP, doze edge functions. Nada aqui é campo aberto — quase toda regra
que parece nova já tem vizinha, e vale procurar antes de inventar.

- **Telas** em `src/features/`: agenda, agendaPublica, clientes, catalogo,
  equipe, financeiro, vendas, pacotes, conexao, configuracoes, rede, assinatura,
  onboarding, ativacao, feedback, notificacoes, recursos, tour, ajuda, legal,
  site, whatsappWeb, auth, adminTool.
- **Comandos**: `npm run typecheck`, `npm run lint` (oxlint), `npm test`
  (vitest), `npm run test:db` (pgTAP).
- **Segredos** ficam em `~/.clubcut/` (fora do repositório). Nunca colar chave,
  token ou senha em arquivo versionado, em comando ou no chat.

### As duas portas pelas quais o CLIENTE mexe

O cliente não tem login, e mesmo assim marca, remarca, cancela, troca os
serviços e deixa recado. Ele entra por duas portas:

1. **Agenda pública** — edge `agenda-publica`, autorizada pelo `token_gestao`
   do agendamento (o link que ele recebe ao marcar).
2. **Agente de WhatsApp** — n8n, autorizado pelo `client_id` que vem do
   telefone.

**A régua de negócio mora numa RPC `security definer` que as duas chamam**, não
na tela nem no prompt. Foi assim que "mudar serviços" ficou com uma regra só:
horário de pé, 30 minutos de antecedência, serviço ativo ou já no agendamento,
e a **trava de sobreposição do banco** decidindo se o tempo a mais cabe. Recusa
de negócio volta como `{ok:false, motivo}` para virar conversa; exceção fica
para chamada malfeita.

## Como se mexe no banco

Migration **não** entra por deploy: é aplicada à mão, e por isso o roteiro é
sempre o mesmo.

1. **Ensaiar em produção dentro de uma transação**: `begin` → DDL → fixtures →
   `assert` → `rollback`. Roda contra o schema real e não deixa rastro. Antes,
   conferir se algum trigger fala para fora (e-mail, webhook).
2. **Aplicar** e **conferir o resultado por consulta** — existência, `definer`,
   e quem pode executar.
3. **Escrever o pgTAP** em `supabase/tests/`: é a catraca que impede a regra de
   ser desfeita sem ninguém notar.

Três armadilhas que já custaram tempo aqui:

- **Função nova nasce com `execute` para `public`.** Todo `create function`
  termina com `revoke ... from public, anon, authenticated` e o `grant` para
  quem deve mesmo. O trinco é reposto à mão, sempre.
- **View se recria por inteiro** (`drop` + `create`), reproduzindo tudo: coluna
  nova no meio da lista levanta 42P16, e `create or replace` perde em silêncio
  o `security_invoker` e os `revoke`.
- **Fixture de teste usa o relógio de São Paulo**
  (`(now() at time zone 'America/Sao_Paulo')::date`), nunca `current_date`: o
  runner do CI vive em UTC, e o teste passava de dia e quebrava de madrugada.

E no CRM: `new Date('YYYY-MM-DD')` é UTC e volta um dia no Brasil — data sem
hora se parseia **por partes**.

## As catracas do CI

Três checks são obrigatórios para mergear: **typecheck/lint/vitest**,
**pgTAP** e **gitleaks**. Além deles, quatro testes existem só para segurar
decisão de projeto — eles leem os arquivos das telas, e quando reclamam a saída
é **consertar a tela**, não afrouxar o teste:

- `src/lib/botoesDoSistema.test.ts` — botão sem classe do sistema tem teto por
  arquivo, e o teto **só desce**. Da última vez a saída certa foi extrair o
  componente: o teto da página caiu de 10 para 7, e o componente novo nasceu
  medido.
- `src/lib/tokensDeCor.test.ts` — toda classe `-soft` usada nas telas precisa
  de token nos **dois** temas. O Tailwind não reclama de classe sem token: ele
  simplesmente não gera nada, e o aviso aparece sem fundo, como texto solto.
- `src/components/ErroDeCarga.test.ts` — carregando, vazio e erro não podem se
  parecer. O último bloco é o tripwire das cinco telas: sob erro, cada uma
  precisa calar o vazio e o total, senão a tela mostra "R$ 0,00" para quem só
  está sem rede.
- `src/features/adminTool/segredoNaoPersiste.test.ts` — a senha do painel
  administrativo não volta para o `sessionStorage`, que pertence à origem
  inteira.

Teste de unidade **importa de módulo puro**, nunca de um arquivo que arraste
`src/lib/supabase.ts`: o client exige `.env` já no import, e o runner do CI não
tem `.env`. Para provar do jeito que o CI vê, esconda o `.env.local` e rode a
suíte.

## Git neste repositório

- **O repositório é PÚBLICO.** Nada de segredo, dado de cliente ou documento
  interno num commit.
- **Nunca `git add -A`**: staging por caminho explícito, conferindo
  `git diff --cached --name-only` antes do commit. Um `-A` já publicou aqui um
  arquivo que não era para existir.
- **`main` é protegida**: tudo entra por pull request, com os três checks
  verdes. Merge só com aprovação explícita do dono.

## graphify

O projeto tem um grafo de conhecimento em `graphify-out/`.

- Para perguntas sobre o código, rode `graphify query "<pergunta>"` quando
  `graphify-out/graph.json` existir; `graphify path "<A>" "<B>"` para relações e
  `graphify explain "<conceito>"` para um ponto específico. Devolvem um
  subgrafo, quase sempre menor que o `GRAPH_REPORT.md` ou um grep cru.
- `graphify-out/GRAPH_REPORT.md` só para revisão ampla de arquitetura, ou
  quando query/path/explain não trouxerem contexto suficiente.
- Depois de mudar código, `graphify update .` mantém o grafo em dia (só AST,
  sem custo de API).

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

## Onde mora cada coisa escrita

- `docs/estado-do-projeto.md` — o que funciona hoje, em meia página.
- `docs/backlog.md` — o ledger: todo achado, decisão e pendência, com o porquê.
- `CLAUDE.md` (este arquivo) — como se trabalha aqui. Não é changelog: se a
  informação envelhece a cada entrega, o lugar dela é o backlog.
