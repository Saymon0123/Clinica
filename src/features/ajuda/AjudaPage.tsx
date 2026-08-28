import { useMemo, useState, type ReactNode } from 'react'
import { HelpCircle, Search } from 'lucide-react'

/**
 * Central de Ajuda: os tutoriais passo a passo de tudo que o sistema faz,
 * em linguagem de dono de barbearia.
 *
 * Existe para o cliente se resolver sozinho antes de chamar o suporte — cada
 * pergunta daqui nasceu do mapa clique-a-clique do giro de 25/08/2026. Quando
 * uma tela mudar de comportamento, o tutorial correspondente muda JUNTO, no
 * mesmo commit: ajuda desatualizada é pior que ajuda nenhuma.
 *
 * O conteúdo é declarativo (texto com **negrito**) para a busca varrer tudo
 * sem depender do DOM.
 */

type Dica = { t: string; atencao?: boolean }
type Item = { p: string; intro?: string; passos?: string[]; extra?: string; dicas?: Dica[] }
type Secao = { titulo: string; itens: Item[] }

const SECOES: Secao[] = [
  {
    titulo: 'Agenda',
    itens: [
      {
        p: 'Como marco um horário para um cliente?',
        passos: [
          'Na **Agenda**, clique no quadradinho vazio do horário e do barbeiro que você quer — ou no botão **Nova reserva** no topo.',
          'Digite o nome do cliente (se ele for novo, o cadastro é criado sozinho) e, se quiser, o telefone.',
          'Escolha o barbeiro, o serviço e confira o horário.',
          'Toque em **Salvar reserva**. Pronto — o horário aparece na grade na hora.',
        ],
        dicas: [
          { t: 'O tempo do serviço é calculado sozinho: um corte de 30 minutos ocupa 30 minutos na grade, sem você fazer conta.' },
        ],
      },
      {
        p: 'Como mudo o horário ou o barbeiro de um agendamento?',
        intro:
          'Do jeito rápido: **arraste o cartão** do agendamento para o novo horário ou para a coluna de outro barbeiro. Se o lugar estiver ocupado, o sistema avisa e devolve o cartão.',
        extra:
          'Para mudar de dia: clique no cartão, toque em **Alterar data/horário**, escolha a nova data e hora e **Salvar**.',
      },
      {
        p: 'Como cancelo um agendamento?',
        passos: ['Clique no cartão do agendamento na Agenda.', 'Toque em **Cancelar agendamento**.'],
        dicas: [
          { t: 'O horário fica cinza riscado (continua visível no dia) e a vaga volta a ficar livre na hora — inclusive para o atendimento automático do WhatsApp oferecer a outro cliente.' },
          { t: 'Cancelar é diferente de excluir: **Excluir agendamento** apaga de vez, sem volta, e pede confirmação.', atencao: true },
        ],
      },
      {
        p: 'Como finalizo um atendimento e cobro o cliente?',
        passos: [
          'Clique no cartão do agendamento e toque em **Concluir e cobrar**.',
          'Você cai direto na tela de venda, já com o cliente, o barbeiro e o serviço preenchidos.',
          'Se ele levou um produto, adicione na comanda. Escolha a forma de pagamento.',
          'Toque em **Finalizar venda**. O agendamento fica verde (concluído) e a venda entra no financeiro.',
        ],
        dicas: [
          { t: 'Se ninguém fechar a comanda, 15 minutos depois do fim previsto do serviço o agendamento é cancelado sozinho e a cadeira volta a ficar livre. Sem problema: se você fechar a comanda depois, ele volta a ficar como concluído automaticamente.', atencao: true },
        ],
      },
    ],
  },
  {
    titulo: 'Vendas e caixa',
    itens: [
      {
        p: 'Como registro uma venda avulsa (sem agendamento)?',
        passos: [
          'Em **Financeiro**, abra a aba **Vendas** e toque em **Nova venda**.',
          'Escolha o cliente (opcional) e o barbeiro que atendeu.',
          'Adicione os serviços e produtos, um por um, com a quantidade.',
          'Escolha a forma de pagamento e toque em **Finalizar venda**.',
        ],
        dicas: [
          { t: 'Vendeu produto? O estoque baixa sozinho. O barbeiro tem comissão? Ela é calculada sozinha, com o percentual dele.' },
        ],
      },
      {
        p: 'Como vendo um pacote (ex.: "pague R$120, leve 5 cortes")?',
        passos: [
          'Na **Nova venda**, escolha o **cliente** (o crédito fica no nome dele).',
          'Em Adicionar item, escolha o tipo **Pacote** e o pacote desejado.',
          'Finalize a venda normalmente. Pronto: o cliente ganhou os créditos, com a validade do pacote.',
        ],
        dicas: [
          { t: 'A comissão do barbeiro sai na venda do pacote, sobre o valor cheio. Os cortes usados depois não geram comissão de novo.' },
        ],
      },
      {
        p: 'Como uso o crédito do pacote de um cliente?',
        passos: [
          'Na **Nova venda**, escolha o cliente — se ele tiver pacote, aparece o saldo ("restam 3 de 5 cortes").',
          'Toque em **Usar 1 do pacote**: o serviço entra na comanda a R$ 0.',
          'Finalize normal. O crédito é descontado sozinho.',
        ],
        dicas: [
          { t: 'Se a venda for desfeita, o crédito volta sozinho — nada de acertar contagem na mão.' },
        ],
      },
      {
        p: 'Como funciona o caixa? Preciso abrir e fechar todo dia?',
        intro:
          '**Não precisa fazer nada.** O caixa abre sozinho na primeira venda do dia (com o troco padrão que você definiu) e fecha sozinho à meia-noite.',
        passos: [
          'Uma vez só: em **Financeiro → Caixa**, defina o **troco padrão** da gaveta e salve.',
          'Se quiser conferir a gaveta no fim do dia (opcional): abra **Conferir a gaveta**, digite quanto tinha de verdade, e o sistema mostra se bateu, sobrou ou faltou.',
        ],
        dicas: [
          { t: 'O valor "esperado na gaveta" conta só pagamentos em dinheiro — Pix e cartão não passam pela gaveta.' },
        ],
      },
      {
        p: 'Como vejo o faturamento de um mês passado?',
        intro:
          'No topo do **Financeiro**, use as setinhas **‹ ›** ao lado de "Este mês". Cada clique volta um mês — todos os números, gráficos e a lista de vendas acompanham.',
      },
      {
        p: 'Como defino ou mudo minha meta de faturamento?',
        intro:
          'Em **Financeiro**, no cartão **Meta de faturamento**, toque em **Definir meta** (ou **Alterar**), digite o valor mensal e salve. Quando bater a meta, o sistema comemora com você.',
      },
      {
        p: 'Como pago as comissões dos barbeiros?',
        passos: [
          'Em **Financeiro → Comissões**, toque em **Fechar comissões**.',
          'Escolha o mês. Você vê, por barbeiro, o que está **a pagar** e o que **já foi pago**.',
          'Pagou o barbeiro? Toque em **Marcar como pago** — fica registrado com a data.',
        ],
        dicas: [
          { t: 'O percentual usado é sempre o que valia no dia de cada venda. Mudar a comissão de alguém hoje não mexe no passado.' },
        ],
      },
      {
        p: 'Como baixo um relatório das vendas?',
        intro:
          'Em **Financeiro**, toque em **Exportar**, escolha **Esta semana** ou **Este mês** e depois **Baixar relatório**. Sai uma planilha com todas as vendas, item por item.',
      },
    ],
  },
  {
    titulo: 'Clientes',
    itens: [
      {
        p: 'Como cadastro um cliente?',
        intro:
          'Em **Clientes**, toque em **Adicionar**: nome (obrigatório), telefone, aniversário e observação. Só isso.',
        dicas: [
          { t: 'Cliente que agenda pelo WhatsApp ou pelo QR do balcão é cadastrado sozinho — você não precisa fazer nada.' },
        ],
      },
      {
        p: 'Como trago meus clientes de uma planilha antiga?',
        passos: [
          'Salve sua planilha como **CSV** com uma coluna "Nome" (telefone, aniversário e observação são opcionais).',
          'Em **Clientes**, toque em **Importar** e escolha o arquivo.',
          'Confira o número de clientes encontrados e toque em **Importar**.',
        ],
        dicas: [
          { t: 'Telefone repetido é pulado automaticamente — pode importar sem medo de duplicar.' },
        ],
      },
      {
        p: 'Como descubro quais clientes sumiram?',
        intro:
          'Em **Clientes**, clique no título da coluna **Última visita**: a lista reordena mostrando primeiro quem está há mais tempo sem vir. Quem passou de 45 dias aparece em vermelho.',
        dicas: [
          { t: 'O telefone é clicável — um toque abre a conversa no WhatsApp para você chamar o cliente de volta.' },
        ],
      },
      {
        p: 'Como vejo os pacotes que um cliente ainda tem?',
        intro:
          'Abra a ficha do cliente (clique no nome dele na lista): o bloco **Pacotes** mostra cada pacote com a barra de progresso, quantos serviços restam e a validade.',
      },
    ],
  },
  {
    titulo: 'Serviços e produtos',
    itens: [
      {
        p: 'Como cadastro um serviço novo ou mudo um preço?',
        passos: [
          'Em **Catálogo → Serviços**, toque em **Novo serviço** (ou **Editar** num existente).',
          'Preencha nome, duração em minutos e preço. Salve.',
        ],
        dicas: [
          { t: 'O serviço novo já nasce disponível para toda a equipe — e o atendimento automático do WhatsApp passa a oferecê-lo na hora. Duração certa importa: é ela que define o tamanho do bloco na agenda.' },
        ],
      },
      {
        p: 'Como tiro um serviço do ar sem apagar o histórico?',
        intro:
          'Em **Catálogo**, toque em **Desativar** na linha do serviço. Ele some do WhatsApp e da agenda, mas todo o histórico de vendas continua intacto. Para voltar, **Ativar**.',
      },
      {
        p: 'Como cadastro produtos e controlo o estoque?',
        passos: [
          'Em **Catálogo → Produtos**, toque em **Novo produto**: nome, preço de venda, estoque atual e o **estoque mínimo** (o nível de alerta).',
          'Vendeu? O estoque baixa sozinho pela comanda.',
          'Chegou mercadoria? Toque em **Repor** na linha do produto e diga só **quantas unidades chegaram** — o sistema soma.',
        ],
        dicas: [
          { t: 'Quando um produto chega ao mínimo, você recebe um **e-mail automático** avisando — não precisa ficar olhando a tela.' },
        ],
      },
    ],
  },
  {
    titulo: 'Equipe',
    itens: [
      {
        p: 'Como coloco um barbeiro novo no sistema?',
        passos: [
          'Em **Equipe**, toque em **Convidar para a equipe**.',
          'Preencha nome, e-mail, função (Barbeiro ou Gerente) e a comissão.',
          'Toque em **Gerar link de convite**. O convite vai por **e-mail automaticamente** — e você também pode copiar o link e mandar pelo WhatsApp, se quiser agilizar.',
          'Ele abre o link, cria a senha dele e pronto: já aparece na agenda.',
        ],
        dicas: [
          { t: 'O link vale 7 dias e só funciona uma vez. Errou o e-mail? Toque em **Trocar e-mail** no convite pendente.' },
        ],
      },
      {
        p: 'O que o barbeiro enxerga quando entra no sistema?',
        intro:
          'Só o que é dele: os próprios agendamentos, os clientes que ele atendeu e a própria comissão. Faturamento da barbearia, WhatsApp, caixa e equipe ficam só com você (e com o gerente).',
      },
      {
        p: 'Como mudo a comissão de um barbeiro?',
        intro:
          'Em **Equipe**, toque no ícone **%** ao lado do nome, digite o novo percentual e confirme. Vale para as vendas dali em diante — o que já foi vendido mantém o percentual antigo.',
      },
      {
        p: 'Como defino os dias e horários que cada barbeiro trabalha?',
        passos: [
          'Em **Equipe**, toque no ícone de **relógio** ao lado do barbeiro.',
          'Marque os dias em que ele trabalha e o horário de entrada e saída de cada um. Salve.',
        ],
        dicas: [
          { t: 'Isso importa de verdade: o atendimento automático do WhatsApp só oferece horários dentro da jornada de cada barbeiro.' },
        ],
      },
      {
        p: 'Como promovo alguém a gerente (ou dono)?',
        intro:
          'Em **Equipe**, use a caixinha de função ao lado do nome e escolha o novo papel. Só o dono consegue fazer isso, e o sistema não deixa a barbearia ficar sem nenhum dono.',
      },
      {
        p: 'Um barbeiro saiu. Como tiro ele do sistema?',
        intro:
          'Toque no ícone de **energia** ao lado do nome para **desativar**. Ele some da agenda, das vendas e do WhatsApp na hora — mas todo o histórico dele fica guardado. Se voltar, é só reativar.',
      },
    ],
  },
  {
    titulo: 'Configurações da barbearia',
    itens: [
      {
        p: 'Como mudo o horário de funcionamento?',
        intro:
          'Em **Configurações**, no bloco **Horário de funcionamento**: marque os dias abertos e os horários, e salve. Dia desmarcado = fechado.',
        dicas: [
          { t: 'O atendimento automático só marca horários dentro dessa janela — mantenha sempre atualizado, principalmente em feriado.' },
        ],
      },
      {
        p: 'Para que serve a "folga entre atendimentos"?',
        intro:
          'É o respiro entre um cliente e outro — tempo de limpar a cadeira e receber o próximo. Com 10 minutos de folga, um corte que acaba às 15:00 só deixa o próximo horário disponível às 15:10. Zero encaixa um colado no outro.',
      },
      {
        p: 'Como crio um pacote de fidelidade (ex.: 5 cortes por R$120)?',
        passos: [
          'Em **Catálogo → Pacotes**, toque em **Novo pacote**.',
          'Dê o nome, escolha os serviços e as quantidades do seu catálogo, e defina o **seu preço**.',
          'A tela mostra na hora quanto o cliente economiza em relação ao avulso. Se quiser, defina uma validade em dias. Salve.',
        ],
        dicas: [
          { t: 'O pacote é a fidelidade de hoje: o cliente paga adiantado com desconto e volta para usar o que já é dele.' },
        ],
      },
      {
        p: 'Como imprimo o QR code do balcão?',
        intro:
          'Em **Configurações → QR do balcão**, toque em **Baixar cartaz em PDF** e imprima. O cliente que escanear cai numa página para marcar horário sozinho, sem falar com ninguém.',
      },
      {
        p: 'Abri uma segunda barbearia. Como coloco no sistema?',
        passos: [
          'Em **Configurações → Unidades**, toque em **Adicionar unidade**.',
          'Na primeira vez, dê um nome para a sua rede. Preencha os dados da unidade nova e, se quiser, marque para copiar os serviços da atual.',
          'Pronto: aparece a aba **Rede**, com o comparativo entre as unidades, e um seletor para trocar de barbearia no topo.',
        ],
      },
    ],
  },
  {
    titulo: 'Pagamento do sistema',
    itens: [
      {
        p: 'Quanto eu pago pelo Club Cut?',
        intro:
          'Você paga **por agendamento feito pelo atendimento automático do WhatsApp** — o valor unitário está na aba **Assinatura**. Sem mensalidade fixa, sem mínimo: mês sem agendamento pelo WhatsApp é mês sem cobrança. Agendamentos que você marca na agenda ou que chegam pelo QR do balcão **não são cobrados**. Lembretes e reativações também não.',
      },
      {
        p: 'Como pago a minha fatura?',
        intro:
          'O mês fecha no último dia e a cobrança chega **por e-mail** e fica visível na aba **Assinatura**, no aviso amarelo — toque em **Pagar** e escolha boleto, Pix ou cartão. Pagou? O acesso renova sozinho em minutos.',
        dicas: [
          { t: 'Antes disso, cadastre seu CPF ou CNPJ na mesma aba — sem ele o boleto não é gerado.' },
        ],
      },
      {
        p: 'Tenho mais de uma unidade. Posso pagar tudo num boleto só?',
        intro:
          'Pode. Em **Assinatura → Cobrança da rede**, toque em **Receber um boleto único da rede** e informe o CPF/CNPJ do pagante. Para voltar a um boleto por unidade, é só um clique no mesmo lugar.',
      },
    ],
  },
  {
    titulo: 'WhatsApp e atendimento automático',
    itens: [
      {
        p: 'Um cliente pediu para falar comigo. O que eu faço?',
        passos: [
          'Quando isso acontece, aparece um **cartão de aviso** em qualquer tela do sistema, com o nome do cliente e um resumo do que ele quer (e uma notificação no seu navegador).',
          'Toque em **Responder**: abre a conversa e você escreve normalmente — para o cliente, é a mesma conversa do WhatsApp da barbearia.',
          'Resolveu? Toque em **Resolvido** no aviso e, na conversa, em **Devolver ao agente** para o atendimento automático voltar a trabalhar.',
        ],
        dicas: [
          { t: 'Enquanto você está na conversa, o atendimento automático fica em silêncio — ele nunca responde por cima de você.' },
        ],
      },
      {
        p: 'Como vejo o que o atendimento automático fez por mim?',
        intro:
          'Na aba **Conexão**: conversas atendidas, tempo médio de resposta, agendamentos e cancelamentos feitos pelo agente, e quantos clientes pediram você. Dá para ver por semana ou por mês.',
      },
      {
        p: 'Preciso deixar um celular ligado para o WhatsApp funcionar?',
        intro:
          '**Não.** Seu número é conectado pela API oficial do WhatsApp (Meta) — sem QR code, sem celular ligado, sem risco de bloqueio. A conexão é feita uma única vez, junto com a nossa equipe, na entrada. Para trocar de número, fale com o suporte.',
      },
    ],
  },
  {
    titulo: 'Sua conta',
    itens: [
      {
        p: 'Esqueci minha senha. E agora?',
        passos: [
          'Na tela de entrada, toque em **Esqueci minha senha** e digite seu e-mail.',
          'Você recebe um **código** por e-mail. Digite o código e crie a senha nova na mesma tela.',
        ],
      },
      {
        p: 'Trabalho em mais de uma barbearia. Como troco entre elas?',
        intro:
          'Toque no seu **avatar** (canto da tela) → **Trocar de barbearia** → escolha. O sistema lembra a sua escolha da próxima vez.',
      },
      {
        p: 'Tenho uma sugestão ou achei um problema. Para onde mando?',
        intro:
          'Avatar → **Enviar sugestão** → escolha Sugestão, Problema ou Elogio, escreva e envie. Vai direto para a equipe do Club Cut, junto com a tela em que você estava — isso ajuda muito a resolver rápido.',
      },
    ],
  },
]

/** **texto** vira <strong>texto</strong> — o suficiente para os tutoriais. */
function negrito(texto: string): ReactNode {
  const partes = texto.split('**')
  return partes.map((parte, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-foreground">
        {parte}
      </strong>
    ) : (
      parte
    ),
  )
}

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function textoDoItem(item: Item) {
  return [
    item.p,
    item.intro ?? '',
    ...(item.passos ?? []),
    item.extra ?? '',
    ...(item.dicas ?? []).map((d) => d.t),
  ].join(' ')
}

export function AjudaPage() {
  const [busca, setBusca] = useState('')
  const termo = normalizar(busca.trim())

  const visiveis = useMemo(
    () =>
      SECOES.map((s) => ({
        ...s,
        itens: termo ? s.itens.filter((i) => normalizar(textoDoItem(i)).includes(termo)) : s.itens,
      })).filter((s) => s.itens.length > 0),
    [termo],
  )

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <HelpCircle size={20} />
          Central de Ajuda
        </h1>
        <p className="text-sm text-muted-foreground">
          Tudo que dá para fazer no sistema, passo a passo. Digite o que você quer fazer — ou
          navegue por área.
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Ex.: remarcar horário, boleto, comissão, estoque..."
          className="w-full border-2 border-border-strong bg-surface text-foreground rounded-xl pl-9 pr-4 py-2.5 text-sm focus:border-primary outline-none"
        />
      </div>

      {visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">
          Nada encontrado com esse termo. Tente outra palavra — ou mande uma sugestão pelo menu do
          seu avatar, que a gente resolve junto.
        </p>
      )}

      {visiveis.map((secao) => (
        <section key={secao.titulo}>
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mt-6 mb-2">
            {secao.titulo}
          </h2>
          <div className="space-y-2">
            {secao.itens.map((item) => (
              <details
                key={item.p}
                open={termo.length > 0 || undefined}
                className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden"
              >
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-2">
                  {item.p}
                </summary>
                <div className="px-4 pb-4 pt-1 border-t border-border text-sm text-muted-foreground space-y-2">
                  {item.intro && <p>{negrito(item.intro)}</p>}
                  {item.passos && (
                    <ol className="list-decimal pl-5 space-y-1.5 marker:text-primary marker:font-semibold">
                      {item.passos.map((passo, i) => (
                        <li key={i}>{negrito(passo)}</li>
                      ))}
                    </ol>
                  )}
                  {item.extra && <p>{negrito(item.extra)}</p>}
                  {item.dicas?.map((dica, i) => (
                    <p
                      key={i}
                      className={`border-l-2 rounded-r-lg px-3 py-2 text-[13px] ${
                        dica.atencao
                          ? 'border-warning bg-warning-soft'
                          : 'border-primary bg-primary-soft/40'
                      }`}
                    >
                      {negrito(dica.t)}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground pt-4">
        Não achou o que procurava? Mande pelo <strong>Enviar sugestão</strong> (menu do avatar) que
        a gente responde — e a resposta vira um tutorial novo aqui.
      </p>
    </div>
  )
}
