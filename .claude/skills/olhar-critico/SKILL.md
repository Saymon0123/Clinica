---
name: olhar-critico
description: Régua de revisão do Club Cut. Use antes de dar qualquer coisa por pronta, e sempre que for analisar, criar ou modificar tela, fluxo, função ou automação. Cobre três coisas: os caminhos que ninguém previu, o design da página e a honestidade do parecer. Chame por nome com /olhar-critico quando quiser a versão longa.
---

# A régua do Club Cut

Três perguntas antes de dizer que está pronto: **quem sai do trilho consegue
seguir?**, **isso está bom de olhar e de usar?** e **eu estou falando a
verdade sobre isso?**

O fluxo feliz é a parte fácil. Ele quase sempre funciona, e é exatamente por
isso que ele não prova nada.

---

## 1. Os caminhos que ninguém previu

Não parar no caminho que dá certo. Para cada fluxo, percorrer o que acontece
quando a pessoa quer algo que o desenho não previu.

**Vale para os dois lados:** o cliente final, que marca o corte, e o dono da
barbearia, que opera o sistema. Os dois saem do trilho.

Perguntas obrigatórias:

- **Outro momento.** E se ela quiser hoje à noite, amanhã, sábado? E fora do
  horário de funcionamento? E no feriado?
- **Outra opção.** E se ela quiser um barbeiro específico, um serviço que não
  está na lista, dois serviços juntos?
- **Mudou de ideia.** Como cancela? Como remarca? Até quando? Quem avisa o
  outro lado?
- **Outra porta.** A mesma coisa chega por QR, link no WhatsApp, agente,
  balcão. O comportamento é o mesmo nas quatro? Deveria ser?
- **Não fez nada.** Abandonou no meio, não respondeu, deixou a tela aberta
  meia hora. O que sobra no banco? O que trava para os outros?
- **Fez duas vezes.** Ou fora de ordem. Ou com o dedo gordo. Ou dois ao mesmo
  tempo no mesmo horário.
- **O espelho.** Quando ela faz isso, o que o outro lado vê? O dono fica
  sabendo? Como, e em quanto tempo?
- **O primeiro dia.** Barbearia recém-criada, sem serviço, sem barbeiro, sem
  cliente. A tela explica o que fazer ou fica muda?

**Não basta ter pensado.** Dizer explicitamente quais caminhos foram cobertos
e quais ficaram de fora de propósito. O que não for dito, o Saymon não tem
como discordar.

---

## 2. O design da página

Funcionar não é estar pronto. A tela também é entregue.

- **Hierarquia.** O que mais importa é o que se lê primeiro? Ou a informação
  principal está do mesmo tamanho do rodapé?
- **Os quatro estados.** Carregando, vazio, erro e cheio. Os quatro são
  desenhados, ou três deles são sobra? Vazio que não explica o que fazer é
  beco sem saída.
- **Celular primeiro.** O cliente final está em pé, com uma mão, sob sol.
  Alvo de toque com 44px, fonte de 16px em campo de formulário (menos que
  isso o iPhone dá zoom), nada de rolagem horizontal.
- **Claro e escuro.** Os dois. Cor definida só dentro do bloco de um tema
  deixa a página ilegível no outro.
- **Sistema, não improviso.** Usar os tokens e as classes que já existem
  (`btn-primary`, `--danger`, `Campo`, `PageHeader`). Cor solta e px solto
  viram dívida na próxima varredura.
- **Confiança.** Quem entrega telefone precisa sentir que é real. Nome do
  negócio, endereço, o que vai acontecer depois. Página anônima parece golpe.
- **Palavra é design.** Botão diz o que faz. Erro diz o que aconteceu e como
  resolver. Nada de "Não foi possível concluir" sem motivo.
- **Terminou de verdade?** Ou parece um formulário jogado na tela?

---

## 3. A honestidade do parecer

O trabalho é dizer o que é verdade, não o que agrada.

- Ruim é ruim, dito na cara, com o motivo junto.
- Bom é bom, dito sem inventar defeito para parecer rigoroso. Crítica
  fabricada é tão desonesta quanto elogio fabricado.
- Discordar **antes** de fazer, não depois. Se o Saymon decidir mesmo assim,
  fazer por inteiro e registrar que a decisão foi dele.
- Separar o que foi verificado do que foi deduzido. "Li o código" e "abri a
  tela e vi" não são a mesma frase.
- Nota honesta quando pedirem nota. Se está médio, é médio. Arredondar para
  cima é mentira educada.

---

## Como fechar

Ao entregar, dizer nesta ordem: o que está bom, o que está ruim, quais
caminhos alternativos foram cobertos, quais ficaram de fora e por quê, e o
que não deu para verificar.
