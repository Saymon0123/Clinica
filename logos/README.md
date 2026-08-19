# Marca do Club Cut

A marca em uso vive em `src/components/MarcaClubCut.tsx` e em
`public/favicon.svg`. Esta pasta guarda as direções exploradas, inclusive as
recusadas — o registro do porquê vale tanto quanto a escolha.

| | Direção | Resultado |
|---|---|---|
| **a** | C cortado na placa | recusada: um anel com abertura diagonal é o glifo universal de "recarregar", e numa aba de navegador leria como ícone de sistema |
| **b** | polaridade invertida | recusada pelo mesmo motivo |
| **c** | CC, a troca de mãos | a mais distintiva, mas os dois C empastam a 16px |
| **d** | **C na régua do poste** | **escolhida** — placa + listra a -52° + C com terminal cortado |

Uma rodada anterior foi descartada inteira: duas direções sumiam em fundo
claro (osso sobre osso) e uma virava um risco ilegível a 16px. Toda direção
precisa carregar placa própria, porque na aba do navegador não se controla a
cor de trás.

Para rever: gere um HTML com os SVGs em 120/48/32/16px sobre fundo escuro,
osso e cinza médio, e renderize com o Chromium do Playwright. Não há
conversor SVG instalado neste ambiente.
