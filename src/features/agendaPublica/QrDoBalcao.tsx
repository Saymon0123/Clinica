import { useState } from 'react'
import { Download, QrCode } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useRecurso } from '../recursos/useRecurso'
import { APP_URL } from '../../lib/appUrl'
import { ErroInline } from '../../components/ErroInline'

/**
 * O cartaz do balcão, em PDF.
 *
 * Antes disto, gerar o QR de uma barbearia significava alguém colar a URL num
 * site de terceiro. Funciona para uma; com dez, o dono do produto vira gargalo
 * de novo — exatamente o que o cadastro aberto e o convite eliminaram.
 *
 * Aqui o dono gera o próprio, sozinho, e recebe um PDF pronto para levar à
 * gráfica ou imprimir em casa.
 *
 * **Gerado inteiramente no navegador dele.** O endereço não sai para serviço
 * nenhum — nem para nós. É público de qualquer forma, mas mandar link de
 * cliente para um gerador aleatório é hábito ruim de ensinar.
 *
 * As duas bibliotecas entram por `import()` dentro do clique: juntas passam de
 * 400 KB, e ninguém deveria carregar isso para abrir Configurações. Quem nunca
 * gera um QR nunca baixa nada.
 */
export function QrDoBalcao() {
  const { salonId, salonName } = useSalon()
  const temAgendaPublica = useRecurso('agenda_publica')

  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Sem o recurso ligado, o link responde 403 — mostrar o cartaz seria oferecer
  // algo que não funciona.
  if (!temAgendaPublica || !salonId) return null

  const link = `${APP_URL}/agendar/${salonId}`

  async function gerarPdf() {
    setGerando(true)
    setErro(null)
    try {
      const [{ default: QRCode }, { jsPDF }] = await Promise.all([
        import('qrcode'),
        import('jspdf'),
      ])

      // Correção de erro alta: o cartaz vai ficar num balcão, sob luz ruim, e
      // pode acabar com um respingo ou um vinco. `H` recupera a leitura com
      // até 30% do código danificado.
      const dataUrl = await QRCode.toDataURL(link, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 1200,
      })

      // `compress` não é detalhe: o QR é preto e branco puro, e sem ele o PDF
      // sai com **4,2 MB** contra 11 KB. O dono vai mandar esse arquivo para a
      // gráfica pelo WhatsApp — 4 MB trava, 11 KB vai na hora. Medido.
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
      const largura = pdf.internal.pageSize.getWidth()
      const centro = largura / 2

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(30)
      pdf.text(salonName ?? 'Barbearia', centro, 38, { align: 'center' })

      pdf.setFontSize(20)
      pdf.text('Chegou sem hora marcada?', centro, 55, { align: 'center' })

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(14)
      pdf.text('Aponte a câmera do celular para o código', centro, 66, { align: 'center' })

      const lado = 110
      pdf.addImage(dataUrl, 'PNG', centro - lado / 2, 76, lado, lado)

      pdf.setFontSize(13)
      pdf.text('Veja os horários livres e marque o seu.', centro, 200, { align: 'center' })

      // O endereço em texto embaixo: câmera velha não lê QR, e sem isto a
      // pessoa fica sem saída na frente do cartaz.
      pdf.setFontSize(8)
      pdf.setTextColor(120)
      pdf.text(link, centro, 212, { align: 'center' })

      pdf.save(`qr-${(salonName ?? 'barbearia').toLowerCase().replace(/\s+/g, '-')}.pdf`)
    } catch (err) {
      console.error('Erro ao gerar o PDF do QR:', err)
      setErro('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="flex items-center gap-2">
        <QrCode size={18} className="text-primary" />
        <h2 className="text-base font-semibold text-foreground">QR do balcão</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Imprima e deixe no balcão. Quem chegar sem hora marcada aponta a câmera, vê os horários
        livres de hoje e marca sozinho — sem tirar você da cadeira.
      </p>

      <button
        onClick={gerarPdf}
        disabled={gerando}
        className="flex items-center justify-center gap-2 w-full btn-primary rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50"
      >
        <Download size={16} />
        {gerando ? 'Gerando...' : 'Baixar cartaz em PDF'}
      </button>

      <ErroInline>{erro}</ErroInline>

      <div>
        <div className="text-[11px] text-muted-foreground mb-1">
          Ou mande este link direto para o cliente:
        </div>
        <code className="block bg-surface-2 rounded-lg px-3 py-2 text-xs break-all text-foreground">
          {link}
        </code>
      </div>
    </div>
  )
}
