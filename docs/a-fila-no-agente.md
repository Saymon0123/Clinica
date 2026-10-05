# A fila de espera no agente — o que sai, e como volta

**Estado: adiada em 05/10/2026, a pedido do dono.** Nada foi apagado. Este
documento existe para que religar não vire arqueologia.

## Por que foi adiada, e o que o levantamento achou

O dono pediu para deixar a fila "para uma versão futura". Ao inventariar o que
era exclusivo dela, apareceu um problema que não era hipotético:

**O agente estava ativo, oferecendo a fila, com a máquina de aviso desligada.**

Três ferramentas ligadas (`Entrar na Fila`, `Sair da Fila`, `Confirmar Vaga da
Fila`) e o prompt mandando, com estas palavras:

> Dia CHEIO nao e fim de conversa. Antes de encerrar, ofereca a fila: "quer que
> eu te avise se abrir?"
> [...] "Te aviso na hora que abrir" e verdade

A última linha era **falsa**: quem chama é o `rodar_a_fila`, que só roda pelo
fluxo `CRM Salão - Fila de Espera (Aviso de Vaga)` — inativo — e o template
`fila_vaga_abriu` está `ativo = false`. O cliente entraria na fila e ninguém
nunca ligaria.

Não chegou a acontecer: `fila_de_espera` tem zero linhas. Mas estava a um dia
cheio de distância.

## O que já está parado e não precisou de nada

| Peça | Estado |
|---|---|
| `fila_de_espera`, `fila_de_espera_servicos`, `fila_avisos` | vazias |
| 9 funções da fila | sem chamador |
| 3 templates | `aprovado`, `ativo = false` |
| Fluxo do aviso no n8n | inativo |
| `FilaDeEspera.tsx` no CRM | some sozinho: `if (!lista.length) return null` |
| 6 arquivos pgTAP | continuam rodando no CI |

Nada disso custa parado, e apagar jogaria fora quinze migrations de trabalho.

## A trava que entrou no lugar (migration 0214)

`entrar_na_fila` passou a recusar **na porta** quando o aviso não pode sair:

```sql
if not exists (
  select 1 from public.whatsapp_templates t
   where t.chave = 'fila_vaga_abriu' and t.status = 'aprovado' and t.ativo
) then
  return jsonb_build_object('ok', false,
    'motivo', 'A fila de espera esta desligada por enquanto. ...');
end if;
```

**No banco, e não só no prompt**, porque prompt apodrece: a informação "a fila
está desligada" passaria a morar na cabeça de quem editou. Aqui vale para
qualquer caminho e **some sozinha quando o template for religado**.

O que ela NÃO cobre: confere o template, não o fluxo do n8n. Religar o template
sem ativar o workflow devolve a promessa vazia — por isso a ordem das duas
chaves está escrita abaixo.

## O que FOI retirado do agente

> Preencher ao executar o passo 3. Até lá, o agente continua oferecendo a fila e
> recebendo a recusa da 0214 — honesto, mas desperdiça uma ida ao banco e uma
> volta de conversa.

### As três ferramentas (`httpRequestTool`, ligadas como `ai_tool`)

Todas em `POST` para `/rest/v1/rpc/<função>`, com credencial Supabase do n8n.

**Entrar na Fila** → `entrar_na_fila`

> Poe o cliente na FILA DE ESPERA, para ser avisado se abrir vaga. Use quando a
> resposta de Horarios Livres nao serve para ele -- dia sem vaga, ou nenhum
> horario que ele aceite. Devolve ok true, ou ok false com motivo (faixa de dias
> que ja passou, barbeiro que nao faz o servico, cliente ja na fila). Entrar na
> fila NAO marca nada e NAO garante horario: alguem precisa desmarcar primeiro.

Corpo: `p_salon_id` do contexto, `p_client_id`, `p_service_ids` (CSV do
`$fromAI` partido por vírgula), `p_de`, `p_ate`, horas opcionais,
`p_professional_id`, `p_origem: 'agente'`.

**Sair da Fila** → `sair_da_fila`

> Tira o cliente da FILA DE ESPERA quando ele diz que nao precisa mais ser
> avisado. Se ele tinha vaga segurada, a vaga volta na hora para outra pessoa.

Corpo: `p_fila_id` do `$fromAI`, lido do campo `fila_id=` do contexto.

**Confirmar Vaga da Fila** → `confirmar_vaga_da_fila`

> Confirma a VAGA SEGURADA de quem foi chamado pela fila de espera. Use SEMPRE
> que o contexto mostrar VAGA SEGURADA [...] e NUNCA o Criar Agendamento nesse
> caso, que criaria um horario em cima da propria reserva dele e seria recusado.

Corpo: `p_fila_id` do `$fromAI`.

### O bloco do prompt

Título **FILA DE ESPERA: O QUE FAZER QUANDO NAO TEM VAGA**, com sete passos.
Vale guardar inteiro porque cada linha foi escrita contra um erro observado:

1. Dia **cheio** oferece fila; dia em que a barbearia **não abre**, não — *"ali
   vaga nunca vai abrir, e prometer aviso e prometer um telefone que nunca
   toca"*.
2. Perguntar numa mensagem só até que dia ele espera e se há período.
3. Ser honesto: *"entrar na fila NAO marca nada e NAO garante horario"*.
4. `ok:false` → repassar o motivo com as próprias palavras.
5. Se o contexto mostrar VAGA SEGURADA, usar `Confirmar Vaga da Fila` e **nunca**
   `Criar Agendamento`.
6. *"Nao precisa mais me avisar"* → `Sair da Fila`.
7. **Nunca dizer que lugar ele ocupa na fila** — *"a ordem depende do que cada um
   aceita, e um numero inventado e promessa que voce nao pode cumprir"*.

E a linha de contexto: `FILA DE ESPERA DELE (lido agora): ...` com o fallback
*"ele NAO esta na fila de espera"*.

### O que NÃO sai

O nó **`Fila do Cliente (Contexto)`** fica. Ele está na cadeia principal
(`Produtos para Contexto → Fila do Cliente (Contexto) → Montar Contexto do
Cliente`) e lê a view `fila_do_cliente`; tirá-lo obriga a recabear o fluxo por um
ganho de uma consulta que sempre volta vazia. Risco não vale o troco.

## Para religar, nesta ordem

1. `update public.whatsapp_templates set ativo = true where chave = 'fila_vaga_abriu';`
   — a 0214 destrava a inscrição sozinha com isso.
2. Ativar o workflow **CRM Salão - Fila de Espera (Aviso de Vaga)**
   (`97Q7LLEdoI9uxS3Q`) no n8n.
3. Repor no agente as três ferramentas e o bloco do prompt, a partir deste
   documento.

Faltando a 1 ou a 2, nada é enviado e nada é chamado — e o gate da 0214 garante
que também nada é prometido.
