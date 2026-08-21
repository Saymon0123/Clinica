# Templates para submeter à Meta

**Gerado de `public.whatsapp_templates` em 2026-08-20.** A tabela é a fonte;
este arquivo é a cópia de trabalho para o cadastro no painel.

**24 templates:** 11 da família lembrete e 13 da família recuperação.

A recuperação acontece em **dois toques — 1 mês e 3 meses** — com textos
diferentes em cada um. Repetir a mesma frase nos dois é o que faz o cliente
bloquear, e bloqueio derruba o alcance dos lembretes.

---

## Antes de cadastrar

**Submeta o `lembrete_agendamento` primeiro e sozinho.** Confira no painel qual
categoria a Meta aplicou antes de mandar o resto. Se ele voltar como
*marketing*, alguma palavra contaminou — e é muito mais barato descobrir isso
num template do que em vinte e três.

**Depois de aprovado, anote no banco a categoria que a Meta deu:**

```sql
update public.whatsapp_templates
   set status = 'aprovado', categoria_meta = 'utility', atualizado_em = now()
 where chave = 'lembrete_confirmacao';
```

A view `templates_recategorizados` mostra onde a Meta discordou do que pedimos —
cada linha ali é custo ~9x maior que o previsto.

**Nada é enviado com status diferente de `aprovado`.** As views já filtram por
isso.

**Regras já aplicadas nos textos:** nome só com minúscula e underscore; nenhum
corpo começa ou termina com variável; não há duas variáveis coladas; no máximo
três botões de resposta rápida.

---

## Família LEMBRETE — todos `utility`

Seguem um agendamento que o cliente fez. Categoria segura.

### lembrete_agendamento
- **Corpo:** Oi, {{1}}! Passando pra lembrar do seu horario na *{{2}}*: {{3}} as {{4}} com {{5}}.
- **Botões:** Sim, confirmo · Reagendar · Cancelar
- **Variáveis:** primeiro nome, barbearia, dia, hora HH:MM, barbeiro

### lembrete_hoje
- **Corpo:** Oi, {{1}}! Seu horario na *{{2}}* e hoje as {{3}}, com {{4}}. Voce vem?
- **Botões:** Sim, confirmo · Reagendar · Cancelar
- **Variáveis:** primeiro nome, barbearia, hora HH:MM, barbeiro

### lembrete_amanha
- **Corpo:** Oi, {{1}}! Seu horario na *{{2}}* e amanha as {{3}}, com {{4}}. Confirma?
- **Botões:** Sim, confirmo · Reagendar · Cancelar
- **Variáveis:** primeiro nome, barbearia, hora HH:MM, barbeiro

### lembrete_primeira_vez
- **Corpo:** Oi, {{1}}! Seu primeiro horario na *{{2}}* e {{3}} as {{4}}. Estamos em {{5}}. Ate la!
- **Botões:** Sim, confirmo · Reagendar · Cancelar
- **Variáveis:** primeiro nome, barbearia, dia, hora HH:MM, endereço

### lembrete_recorrente
- **Corpo:** Oi, {{1}}! Seu horario fixo na *{{2}}* e {{3}} as {{4}}, com {{5}}. Mantem?
- **Botões:** Sim, confirmo · Reagendar · Cancelar
- **Variáveis:** primeiro nome, barbearia, dia, hora HH:MM, barbeiro

### agendamento_confirmado
- **Corpo:** Prontinho, {{1}}! Seu horario na *{{2}}* ficou {{3}} as {{4}}, com {{5}}.
- **Botões:** Cancelar
- **Variáveis:** primeiro nome, barbearia, dia, hora HH:MM, barbeiro

### reagendamento_confirmado
- **Corpo:** Certo, {{1}}! Seu horario na *{{2}}* passou para {{3}} as {{4}}, com {{5}}.
- **Botões:** Cancelar
- **Variáveis:** primeiro nome, barbearia, dia, hora HH:MM, barbeiro

### cancelamento_confirmado
- **Corpo:** Ok, {{1}}! Cancelei seu horario de {{2}} as {{3}} na *{{4}}*. Quando quiser marcar de novo, e so chamar.
- **Botões:** Quero remarcar
- **Variáveis:** primeiro nome, dia, hora HH:MM, barbearia

### imprevisto_na_barbearia
- **Corpo:** Oi, {{1}}! Tivemos um imprevisto e precisamos cancelar seu horario de {{2}} as {{3}} na *{{4}}*. Desculpa pelo transtorno.
- **Botões:** Quero remarcar
- **Variáveis:** primeiro nome, dia, hora HH:MM, barbearia

### cliente_atrasado
- **Corpo:** Oi, {{1}}! Aqui e da *{{2}}*. Seu horario era {{3}} e a cadeira esta te esperando. Consegue chegar nos proximos minutos?
- **Botões:** Estou chegando · Nao vou poder ir
- **Variáveis:** primeiro nome, barbearia, hora marcada HH:MM

### fim_do_teste_gratis
- **Corpo:** Oi! O teste gratis do Club Cut na *{{1}}* acaba {{2}}. Pra continuar com a agenda e o atendimento automatico, e so assinar dentro do sistema.
- **Botões:** (nenhum)
- **Variáveis:** barbearia, quando acaba

---

## Família RECUPERAÇÃO — parte A: `utility`

**Só use estes quando o pedido existir de verdade.** A frase *"você pediu"*
passa na aprovação mesmo sendo falsa — mas quem recebe sem ter pedido bloqueia,
e bloqueio derruba a nota do número, que estrangula os lembretes. A economia se
paga com a funcionalidade que dá lucro.

### retorno_pedido
- **Corpo:** Oi, {{1}}! Voce pediu para que te avisassemos quando desse tempo de voltar na *{{2}}*. Ja faz {{3}}. Quer marcar?
- **Botões:** Quero marcar · Agora nao
- **Variáveis:** primeiro nome, barbearia, tempo desde a última visita

### retorno_pedido_servico
- **Corpo:** Oi, {{1}}! Voce pediu para que te avisassemos quando fosse hora de repetir seu {{2}} na *{{3}}*. Deu o tempo. Quer marcar?
- **Botões:** Quero marcar · Agora nao
- **Variáveis:** primeiro nome, serviço, barbearia

### retorno_pedido_barbeiro
- **Corpo:** Oi, {{1}}! Voce pediu para que te avisassemos quando desse tempo de voltar. O {{2}} tem horario livre essa semana na *{{3}}*. Quer marcar?
- **Botões:** Quero marcar · Agora nao
- **Variáveis:** primeiro nome, barbeiro, barbearia

### retorno_recorrente
- **Corpo:** Oi, {{1}}! Voce pediu para que te avisassemos todo mes na *{{2}}*, e ja faz {{3}} desde a ultima vez. Quer marcar?
- **Botões:** Quero marcar · Agora nao
- **Variáveis:** primeiro nome, barbearia, tempo desde a última visita

### retorno_intervalo
- **Corpo:** Oi, {{1}}! Voce pediu para que te avisassemos quando desse o intervalo do seu {{2}}. Ja faz {{3}}. Quer marcar na *{{4}}*?
- **Botões:** Quero marcar · Agora nao
- **Variáveis:** primeiro nome, serviço, tempo desde a última visita, barbearia

### retorno_pedido_segunda
- **Corpo:** Oi, {{1}}! Faz {{2}} desde a sua ultima passada na *{{3}}*. Voce pediu para que te avisassemos, entao fica o lembrete. Quer marcar?
- **Botões:** Quero marcar · Nao quero mais receber
- **Variáveis:** primeiro nome, tempo desde a última visita, barbearia

> **Segundo toque (3 meses)** da família por opt-in. O primeiro é o
> `retorno_pedido`.

### retorno_faltou
- **Corpo:** Oi, {{1}}! Voce tinha horario na *{{2}}* em {{3}} e acabou nao dando pra vir. Quer remarcar?
- **Botões:** Quero remarcar · Agora nao
- **Variáveis:** primeiro nome, barbearia, dia que faltou

> **O mais provável de voltar recategorizado.** Ele segue um agendamento real
> que o cliente perdeu, o que é utilidade — mas a intenção também é trazer de
> volta. Pedimos `utility` de boa-fé; se a Meta devolver `marketing`, registre
> em `categoria_meta` e siga.

---

## Família RECUPERAÇÃO — parte B: `marketing`

**~R$ 0,35 cada, contra ~R$ 0,04 de um lembrete.** Não continuam nenhuma ação do
cliente, e por isso são marketing — tirar o desconto não muda, porque a Meta
classifica por intenção.

Todos levam o botão **"Nao quero mais receber"**, que é opt-out de LGPD e
também o que segura a taxa de bloqueio.

### sentimos_sua_falta
- **Corpo:** Oi, {{1}}! Faz {{2}} que voce nao passa aqui na *{{3}}*. Bora marcar um horario?
- **Botões:** Quero marcar
- **Variáveis:** primeiro nome, tempo desde a última visita, barbearia

### reativacao_convite
- **Corpo:** Oi, {{1}}! Aqui e da *{{2}}*. Faz um tempinho que a gente nao te ve por aqui. Quer marcar um horario?
- **Botões:** Quero marcar · Nao quero mais receber
- **Variáveis:** primeiro nome, barbearia

### reativacao_tempo
- **Corpo:** Oi, {{1}}! Ja faz {{2}} desde o seu ultimo corte na *{{3}}*. Quer marcar um horario?
- **Botões:** Quero marcar · Nao quero mais receber
- **Variáveis:** primeiro nome, tempo desde a última visita, barbearia

### reativacao_barbeiro
- **Corpo:** Oi, {{1}}! Aqui e da *{{2}}*. O {{3}} continua atendendo por aqui e tem horario livre. Quer marcar?
- **Botões:** Quero marcar · Nao quero mais receber
- **Variáveis:** primeiro nome, barbearia, barbeiro

### reativacao_horario_livre
- **Corpo:** Oi, {{1}}! Aqui e da *{{2}}*. Temos horario livre {{3}}, se quiser aproveitar pra dar um trato no cabelo.
- **Botões:** Quero marcar · Nao quero mais receber
- **Variáveis:** primeiro nome, barbearia, quando

### reativacao_aniversario
- **Corpo:** Oi, {{1}}! Aqui e da *{{2}}*. Passando so pra desejar feliz aniversario. Se quiser dar um trato no visual, e so chamar.
- **Botões:** Quero marcar · Nao quero mais receber
- **Variáveis:** primeiro nome, barbearia

> Este é o único que finalmente usa `clients.aniversario` — um campo que o
> sistema coleta no cadastro e na importação de planilha desde sempre, e que
> nunca teve nenhum uso.
