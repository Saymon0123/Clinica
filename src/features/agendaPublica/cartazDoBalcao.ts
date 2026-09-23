import type { jsPDF } from 'jspdf'
import type { BitMatrix } from 'qrcode'

/**
 * O desenho do cartaz do balcão, separado da tela.
 *
 * Mora fora do `QrDoBalcao.tsx` por dois motivos: o arquivo da tela arrasta
 * `supabase.ts`, que exige `.env` já no import e por isso não pode ser
 * importado por teste de unidade; e porque desenho de página cresce, e crescer
 * dentro de um componente React esconde a régua atrás de JSX.
 *
 * Tudo aqui é helvetica. jsPDF só traz helvetica, times e courier — embutir a
 * Archivo custaria uns 200 KB de TTF em base64 dentro do PDF, contra os 11 KB
 * que o arquivo tem hoje. O dono manda esse PDF para a gráfica pelo WhatsApp;
 * o número pequeno vale mais que a fonte certa. Se um dia a fonte entrar, é
 * aqui, e o número volta a ser medido.
 */

type Cor = readonly [number, number, number]

// Espelham os tokens do tema claro em `src/index.css`. Papel não tem tema
// escuro, então a versão clara é a única que existe aqui.
const VERDE: Cor = [0x1f, 0x5d, 0x42] // --primary
const TINTA: Cor = [0x0e, 0x15, 0x12] // --foreground
const PAPEL: Cor = [0xf3, 0xf1, 0xea]
const VERDE_CLARO: Cor = [0x7c, 0xc5, 0xa0]
const CINZA_TEXTO: Cor = [0x2f, 0x3a, 0x34]

// As listras da logo são translúcidas no SVG original. Aqui elas já vêm
// misturadas: jsPDF faz transparência por `GState`, que é estado global e
// vaza para o resto da página se alguém esquecer de restaurar. Cor pronta não
// tem como vazar.
const LISTRA_SOBRE_VERDE: Cor = [0x1a, 0x4a, 0x36] // #0D1512 a 26% sobre --primary
const LISTRA_SOBRE_PAPEL: Cor = [0xb3, 0xc5, 0xb8] // --primary a 30% sobre o papel

// A4, em milímetros.
const LARGURA = 210
const ALTURA = 297
const MARGEM = 14
const BARRA_TOPO = 30
const BARRA_RODAPE = 20

/**
 * Parâmetros do QR, achados por tentativa e erro com dois leitores (zxing e
 * OpenCV) em três tamanhos. Não são gosto:
 *
 * - **olho reto.** Arredondar os três quadrados de canto ficava bonito e o
 *   zxing lia, mas o OpenCV falhava de forma errática. Cartaz de parede não
 *   pode depender de qual leitor o cliente tem no bolso.
 * - **zona de silêncio de 4 módulos.** É o que a norma pede. Com menos, os
 *   dois leitores falham. `QRCode.create()` **não** inclui essa folga — quem
 *   desenha precisa reservar.
 * - **módulo redondo e vão de 9 módulos para a marca** passaram limpo nos dois.
 */
const RAIO_DO_MODULO = 0.44
const ZONA_DE_SILENCIO = 4
const VAO_DA_MARCA = 9

/**
 * O tamanho de fonte que faz o texto caber na largura disponível.
 *
 * "El Corte" cabe em qualquer corpo; "Barbearia do Zé Studio Premium" não. Sem
 * isto o nome da barbearia atravessa a margem e some na guilhotina da gráfica.
 *
 * Recebe a largura medida **no corpo 1** porque em jsPDF a largura do texto é
 * linear no corpo da fonte: medir uma vez e dividir evita um laço de tentativa.
 */
export function tamanhoQueCabe(opcoes: {
  larguraEm1: number
  larguraMax: number
  maximo: number
  minimo: number
}): number {
  const { larguraEm1, larguraMax, maximo, minimo } = opcoes
  if (larguraEm1 <= 0) return maximo
  return Math.max(minimo, Math.min(maximo, larguraMax / larguraEm1))
}

function preencher(pdf: jsPDF, cor: Cor) {
  pdf.setFillColor(cor[0], cor[1], cor[2])
}

function tracar(pdf: jsPDF, cor: Cor) {
  pdf.setDrawColor(cor[0], cor[1], cor[2])
}

function escrever(pdf: jsPDF, cor: Cor) {
  pdf.setTextColor(cor[0], cor[1], cor[2])
}

/**
 * A marca do Club Cut: ladrilho de canto arredondado, o anel do poste vazado
 * e as listras diagonais.
 *
 * As proporções vêm do `public/favicon.svg`, em coordenadas de 512, para o
 * cartaz e o favicon não divergirem quando um dos dois for mexido.
 *
 * `anel` é a cor que aparece **através** do vazado — no SVG isso é o fundo, e
 * aqui é sempre a cor de quem está atrás da marca. É por isso que a marca na
 * barra verde é o negativo da marca dentro do QR: mesma forma, fundos opostos.
 */
function desenharMarca(
  pdf: jsPDF,
  x: number,
  y: number,
  lado: number,
  cores: { ladrilho: Cor; anel: Cor; listra: Cor },
) {
  const p = lado / 512 // de coordenadas do SVG para milímetros

  pdf.saveGraphicsState()

  // Recorta no ladrilho: as listras e a tampa do vazado passam da borda por
  // construção, e sem o recorte elas escorrem para cima da barra.
  pdf.roundedRect(x, y, lado, lado, 116 * p, 116 * p, null)
  pdf.clip()
  pdf.discardPath()

  preencher(pdf, cores.ladrilho)
  pdf.rect(x, y, lado, lado, 'F')

  // O anel do poste, vazado: um círculo traçado com a cor de quem está atrás.
  tracar(pdf, cores.anel)
  pdf.setLineWidth(72 * p)
  pdf.circle(x + 256 * p, y + 256 * p, 132 * p, 'S')

  // A abertura do "C": no SVG é um retângulo girado -52° que devolve o
  // ladrilho por cima de um pedaço do anel. jsPDF não gira retângulo, então
  // ele entra como polígono de quatro pontos já rotacionados.
  const ang = (-52 * Math.PI) / 180
  const cos = Math.cos(ang)
  const sen = Math.sin(ang)
  const girar = (px: number, py: number): [number, number] => {
    const dx = px - 256
    const dy = py - 256
    return [x + (256 + dx * cos - dy * sen) * p, y + (256 + dx * sen + dy * cos) * p]
  }
  const cantos: Array<[number, number]> = [
    girar(256, 206),
    girar(586, 206),
    girar(586, 306),
    girar(256, 306),
  ]
  preencher(pdf, cores.ladrilho)
  pdf.lines(
    [
      [cantos[1][0] - cantos[0][0], cantos[1][1] - cantos[0][1]],
      [cantos[2][0] - cantos[1][0], cantos[2][1] - cantos[1][1]],
      [cantos[3][0] - cantos[2][0], cantos[3][1] - cantos[2][1]],
    ],
    cantos[0][0],
    cantos[0][1],
    [1, 1],
    'F',
    true,
  )

  // As três diagonais. São o poste de barbeiro, e é a única listra da peça —
  // as barras do cartaz são chapadas de propósito.
  tracar(pdf, cores.listra)
  pdf.setLineWidth(58 * p)
  const diagonais: Array<[number, number, number, number]> = [
    [-120, 340, 340, -120],
    [-40, 560, 560, -40],
    [180, 640, 640, 180],
  ]
  for (const [x1, y1, x2, y2] of diagonais) {
    pdf.line(x + x1 * p, y + y1 * p, x + x2 * p, y + y2 * p)
  }

  pdf.restoreGraphicsState()
}

/**
 * O QR, módulo a módulo.
 *
 * Desenhado em vetor em vez de colado como PNG. Isso **custa tamanho**: são uns
 * mil e cem círculos, e o PDF sai com 58 KB contra os 11 KB da versão em
 * imagem. Medido, não estimado.
 *
 * Os 58 KB passam porque o problema original era outro: sem compressão o
 * arquivo ia a 4,2 MB e travava no WhatsApp. 11 KB e 58 KB estão do mesmo lado
 * dessa linha; 4,2 MB não estava. O que se ganha é impressão nítida em
 * qualquer ampliação — o cartaz vira adesivo de vitrine sem serrilhar — e o
 * módulo redondo com a marca no meio, que a imagem pronta não permitia.
 *
 * Se algum dia o tamanho voltar a importar, o corte mais barato é trocar o
 * círculo por quadrado: o bezier de cada módulo é o que pesa.
 *
 * `lado` inclui a zona de silêncio. Quem chama não precisa saber disso.
 */
function desenharQr(pdf: jsPDF, modulos: BitMatrix, x: number, y: number, lado: number) {
  const n = modulos.size
  const passo = lado / (n + ZONA_DE_SILENCIO * 2)
  const ox = x + ZONA_DE_SILENCIO * passo
  const oy = y + ZONA_DE_SILENCIO * passo

  const ehOlho = (lin: number, col: number) =>
    (lin < 7 && col < 7) || (lin < 7 && col >= n - 7) || (lin >= n - 7 && col < 7)

  const inicioDoVao = (n - VAO_DA_MARCA) / 2
  const fimDoVao = inicioDoVao + VAO_DA_MARCA
  const noVao = (lin: number, col: number) =>
    lin >= inicioDoVao && lin < fimDoVao && col >= inicioDoVao && col < fimDoVao

  preencher(pdf, TINTA)
  for (let lin = 0; lin < n; lin++) {
    for (let col = 0; col < n; col++) {
      if (!modulos.get(lin, col)) continue
      if (ehOlho(lin, col) || noVao(lin, col)) continue
      pdf.circle(ox + (col + 0.5) * passo, oy + (lin + 0.5) * passo, passo * RAIO_DO_MODULO, 'F')
    }
  }

  // Os três olhos: anel de um módulo e miolo de três. Cantos retos.
  for (const [lin, col] of [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ]) {
    tracar(pdf, TINTA)
    pdf.setLineWidth(passo)
    pdf.rect(ox + (col + 0.5) * passo, oy + (lin + 0.5) * passo, passo * 6, passo * 6, 'S')
    preencher(pdf, TINTA)
    pdf.rect(ox + (col + 2) * passo, oy + (lin + 2) * passo, passo * 3, passo * 3, 'F')
  }

  const ladoDaMarca = VAO_DA_MARCA * passo * 0.82
  const centro = (n / 2) * passo
  desenharMarca(pdf, ox + centro - ladoDaMarca / 2, oy + centro - ladoDaMarca / 2, ladoDaMarca, {
    ladrilho: VERDE,
    anel: PAPEL,
    listra: LISTRA_SOBRE_VERDE,
  })
}

/**
 * Monta a página inteira.
 *
 * O `pdf` chega vazio e sai pronto para `save()`. Quem chama continua dono do
 * nome do arquivo e do momento do download.
 */
export function desenharCartaz(
  pdf: jsPDF,
  dados: { nome: string; link: string; modulos: BitMatrix },
) {
  const { nome, link, modulos } = dados
  const centro = LARGURA / 2

  // O papel. Creme em vez de branco porque é a cor da marca — e porque branco
  // puro ao lado do verde chapado deixa a peça com cara de formulário.
  preencher(pdf, PAPEL)
  pdf.rect(0, 0, LARGURA, ALTURA, 'F')

  // ---- barra de cima: verde chapado ----
  preencher(pdf, VERDE)
  pdf.rect(0, 0, LARGURA, BARRA_TOPO, 'F')

  const ladoDaLogo = 13
  desenharMarca(pdf, MARGEM, (BARRA_TOPO - ladoDaLogo) / 2, ladoDaLogo, {
    ladrilho: PAPEL,
    anel: VERDE,
    listra: LISTRA_SOBRE_PAPEL,
  })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(19)
  escrever(pdf, PAPEL)
  pdf.text('Club Cut', MARGEM + ladoDaLogo + 5, BARRA_TOPO / 2 + 2.6)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  escrever(pdf, VERDE_CLARO)
  pdf.text('AGENDAMENTO ONLINE', LARGURA - MARGEM, BARRA_TOPO / 2 + 1.2, {
    align: 'right',
    charSpace: 0.5,
  })

  // ---- o nome da barbearia ----
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(1)
  const corpoDoNome = tamanhoQueCabe({
    larguraEm1: pdf.getTextWidth(nome),
    larguraMax: LARGURA - MARGEM * 2 - 8,
    maximo: 34,
    minimo: 15,
  })
  pdf.setFontSize(corpoDoNome)
  escrever(pdf, TINTA)
  pdf.text(nome, centro, 74, { align: 'center' })

  pdf.setFontSize(20)
  pdf.text('Chegou sem hora marcada?', centro, 90, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  escrever(pdf, VERDE)
  pdf.text('APONTE A CÂMERA DO CELULAR', centro, 101, { align: 'center', charSpace: 0.55 })

  // ---- o QR, no cartão branco ----
  const ladoDoCartao = 124
  const cartaoX = centro - ladoDoCartao / 2
  const cartaoY = 107
  preencher(pdf, [0xff, 0xff, 0xff])
  tracar(pdf, VERDE)
  pdf.setLineWidth(0.6)
  pdf.roundedRect(cartaoX, cartaoY, ladoDoCartao, ladoDoCartao, 6, 6, 'FD')

  const folga = 6
  desenharQr(pdf, modulos, cartaoX + folga, cartaoY + folga, ladoDoCartao - folga * 2)

  // ---- o fecho ----
  // Fala em catorze dias de propósito. O card desta funcionalidade na tela de
  // Configurações já dizia "os horários livres de hoje" e foi corrigido em
  // 13/09, quando a janela passou de um dia para catorze: frase que descreve
  // errado o que o produto faz vende menos do que ele entrega. O cartaz tinha
  // ficado para trás.
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(13)
  escrever(pdf, CINZA_TEXTO)
  pdf.text('Veja os horários livres dos próximos 14 dias', centro, 245, { align: 'center' })
  pdf.text('e marque o seu. Sem ligar, sem esperar resposta.', centro, 252, { align: 'center' })

  // ---- barra de baixo: verde chapado ----
  preencher(pdf, VERDE)
  pdf.rect(0, ALTURA - BARRA_RODAPE, LARGURA, BARRA_RODAPE, 'F')

  // O endereço em texto: câmera velha não lê QR, e sem isto a pessoa fica sem
  // saída na frente do cartaz.
  pdf.setFontSize(8)
  escrever(pdf, VERDE_CLARO)
  pdf.text(link, MARGEM, ALTURA - BARRA_RODAPE / 2 + 1.2)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  escrever(pdf, PAPEL)
  pdf.text('clubcut.space', LARGURA - MARGEM, ALTURA - BARRA_RODAPE / 2 + 1.2, { align: 'right' })
}
