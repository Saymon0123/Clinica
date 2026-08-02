# Estado do projeto

O que já foi verificado, como está configurado o ambiente, e as regras de
trabalho combinadas. Complementa [`visao.md`](visao.md) (o que queremos),
[`backlog.md`](backlog.md) (o que falta) e
[`mercado-e-roadmap.md`](mercado-e-roadmap.md) (posicionamento e versões).

Última atualização: 2026-08-01.

---

## 1. Regras de trabalho combinadas

**Defeito encontrado durante o teste de uma versão é corrigido dentro do
próprio ciclo**, não adiado. Ao terminar o roteiro, a versão testada precisa
estar pronta para produção. O backlog é para o que está **fora** do escopo da
versão em teste — funcionalidade futura, dívida arquitetural, decisão de
produto —, não para defeito do que está sendo testado agora.

**Achado novo vai para o `backlog.md` e é reindexado** (`graphify update .`),
com o *porquê* e o caminho de correção. Não fica só na conversa.

**Verificar contra o banco, não contra a tela.** Várias vezes a interface
mostrou uma coisa e o banco outra — o cliente órfão, a comissão zerada, a
sessão expirada. A tela é a fonte primária do sintoma; o banco explica a causa.

---

## 2. O que foi verificado ponta a ponta

Testes conduzidos em 2026-07-29 a 08-01, cada passo conferido no banco.

| Área | Cobertura |
|---|---|
| Criação de barbearia | 3 formatos (solo, com equipe, rede), com `dono_atende` |
| Login e papéis | dono, gerente e barbeiro, com contraste entre eles |
| Guards de rota | `/web`, `/conexao`, `/configuracoes` redirecionam; `/equipe` bloqueia com mensagem |
| Catálogo | serviços (incl. barbeiro acrescentando o próprio) e produtos |
| Equipe | convite com papel e comissão, aceite, jornada com folga, comissão editável |
| Clientes | cadastro pelo dono e pelo barbeiro (`created_by`), importação CSV |
| Agenda | criação, cálculo do término pela duração, trava de sobreposição (`23P01`) |
| Financeiro | caixa, comanda com serviço + produto, comissão, baixa de estoque |
| Rede | painel consolidado, troca de unidade, isolamento entre unidades |
| Configurações | nome, endereço, telefone e horário de funcionamento |
| WhatsApp | conexão, agente respondendo e criando agendamento (parcial) |

**Não verificado ainda:** Fase 9 completa (confirmação de serviço pelo agente,
teste de grupo com `groupsIgnore`, oferta respeitando folga) e Fase 10
(handoff dono/agente). Dependem de celular com o WhatsApp conectado.

### Casos difíceis que passaram

- **Desduplicação por telefone:** `(41) 98727-5895` e `554187275895`
  reconhecidos como a mesma pessoa, via `telefone_norm` (últimos 8 dígitos)
- **Sobreposição de horário:** recusada pelo banco com `23P01` e traduzida na
  tela, sem erro cru
- **Importação CSV:** `;` dentro de campo entre aspas, aspas escapadas, BOM do
  Excel, CRLF, acentos e campos vazios
- **Comissão:** incide só sobre serviço, não sobre produto
- **Caixa:** soma só pagamento em dinheiro; pix e cartão não passam pela gaveta

---

## 3. Configuração do ambiente

Coisas que custaram tempo para descobrir e não estão em nenhum código.

### Vercel
- **Production Branch é `main`.** Estava apontando para
  `claude/avec-audit-ui-security-cjnxwi`, uma branch de feature antiga — todo
  merge na `main` virava deploy de *preview* e nunca chegava ao ar
- **Variáveis de ambiente** ficam em *Settings → Environments → Production*
  (a Vercel moveu de lugar). São três: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`
- Sem elas o app **falha ao iniciar**, de propósito — o fallback embutido foi
  removido para não conectar em silêncio no projeto errado
- Toda mudança de variável exige **redeploy**: o Vite embute os valores na build

### Supabase
- **Migrations do repositório não seguem o formato do CLI.** O histórico real
  tem nomes diferentes dos arquivos. Evitar `supabase db push` até o
  realinhamento — as 20 primeiras migrations não são idempotentes
- **Envio de e-mail** hoje sai por SMTP do Gmail. Há intervalo mínimo entre
  envios para o mesmo endereço (`429 over_email_send_rate_limit`), além do
  limite por hora ajustável em *Authentication → Rate Limits*
- **Template de recuperação** precisa incluir `{{ .Token }}` para o fluxo por
  código funcionar. Ainda pendente
- **Lista de URLs permitidas** (*Authentication → URL Configuration*) precisa
  do domínio de produção e do localhost, senão o Supabase ignora o `redirectTo`

### Evolution API
- Servidor v2.3.7. Settings em `POST /settings/set/{instance}`, corpo plano
- A edge function `whatsapp` aplica `groupsIgnore` e os eventos a cada conexão
- `scripts/evolution-aplicar-config.mjs` faz o backfill nas instâncias antigas
- `scripts/evolution-remover-instancias.mjs` limpa instâncias órfãs — apagar a
  barbearia no banco **não** remove a instância no servidor

### Edge functions em produção
`whatsapp` v18 · `admin-create-salon` v15 · `accept-invite` v4 ·
`add-salon-unit` v2

---

## 4. Ambiente de desenvolvimento

- **Sem Docker:** `supabase db start`, `supabase test db` e `supabase db pull`
  não rodam localmente. Os testes de RLS só rodam no CI
- **`gh` autenticado:** dá para ler logs de CI direto
- Dados de teste em produção usam prefixo `ZZ` para facilitar a limpeza

---

## 5. Dados de teste em produção

Não há cliente real ainda — tudo em produção é teste. Prefixo `ZZ` marca o que
foi criado durante os testes e pode ser apagado.

| Barbearia | Formato | WhatsApp | Observação |
|---|---|---|---|
| Curitiba | rede "El Guardian" | **conectado** | dono é profissional (criada antes da correção) |
| São José dos Pinhais | rede "El Guardian" | não | idem |
| ZZ Teste Dono Nao Atende | unidade com equipe | não | dono **não** é profissional; barbeiro com folga na quarta |

Contas (senhas não registradas aqui de propósito — redefinir pelo painel do
Supabase em *Authentication → Users* é mais rápido que por e-mail):

- `saycast57@gmail.com` — dono da rede El Guardian
- `castrocollin01+teste1@gmail.com` — dono da ZZ Teste
- `castrocollin01+barbeiro1@gmail.com` — barbeiro da ZZ Teste, comissão 62%
- `castrocollin01@gmail.com` — conta pessoal, **sem vínculo** com barbearia

Ao apagar barbearia: `salons` não tem cascade em
`order_items.professional_id`, então é preciso apagar na ordem — comissões,
itens, pagamentos, comandas, agendamentos, caixa — antes dos salões. E a
instância na Evolution some com `scripts/evolution-remover-instancias.mjs`,
não com o delete no banco.

## 6. Decisões em aberto

- Conectar o WhatsApp na barbearia nova (tem folga configurada, dono fora do
  atendimento) ou seguir na Curitiba, já conectada
- Os quatro pontos `[ABERTO]` da [`visao.md`](visao.md), principalmente **o que
  o agente nunca deve fazer**
- Rotacionar a `EVOLUTION_API_KEY`, exposta duas vezes durante os testes
