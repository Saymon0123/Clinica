/**
 * Canais públicos do Club Cut, num lugar só.
 *
 * O rodapé e qualquer página futura leem daqui. Canal sem valor real fica
 * `null` e simplesmente não aparece — nunca inventar um número de WhatsApp ou
 * um e-mail que não existe só para o rodapé parecer completo: alguém VAI
 * escrever para ele.
 *
 * Quando o canal oficial existir, preencha aqui e ele aparece sozinho.
 */
/**
 * O e-mail oficial, separado do resto de propósito.
 *
 * Os outros canais podem ser `null` — um WhatsApp que não existe some do
 * rodapé e ninguém se machuca. **O e-mail não pode**: a página de
 * privacidade obriga um canal para pedido de LGPD (acesso, correção,
 * exclusão), e uma página que manda escrever para lugar nenhum é pior do que
 * não ter a página. Por isso ele é uma constante não anulável, e a
 * Privacidade importa daqui em vez de repetir o endereço.
 *
 * Trocado em 10/09 de `contato@aurastudioai.com.br` (o domínio da empresa)
 * para o do próprio produto. **O site era a peça atrasada:** os três nós de
 * envio do n8n — detalhamento de uso, boleto ao dono e convite de equipe —
 * já assinavam `Club Cut <contato@clubcut.space>`, e o link do convite já
 * usa `clubcut.space` desde 04/09. Quem escrevesse para o endereço do
 * rodapé caía num domínio diferente do que respondia os e-mails.
 *
 * Em minúscula para bater exatamente com o remetente que já está no ar.
 * Endereço de e-mail é insensível a maiúscula na entrega, mas exibir duas
 * grafias do mesmo endereço em lugares diferentes é o tipo de detalhe que
 * faz alguém perguntar se são duas caixas.
 *
 * Estava escrito à mão em três lugares — aqui e duas vezes na Privacidade —
 * e a última troca de valor repetido deste projeto (o prazo do teste)
 * mostrou que o terceiro lugar é sempre o esquecido.
 */
export const EMAIL_OFICIAL = 'contato@clubcut.space'

export const CONTATO = {
  /** Número do WhatsApp de suporte, só dígitos com DDI (ex.: '5541999990000'). */
  whatsapp: '5541987275895' as string | null,
  /** E-mail de suporte. Ver `EMAIL_OFICIAL` acima. */
  email: EMAIL_OFICIAL as string | null,
  /** Perfil do Instagram, sem @ (ex.: 'clubcut.app'). */
  instagram: 'auraiagency' as string | null,
}
