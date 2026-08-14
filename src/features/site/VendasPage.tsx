import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  Check,
  MessageCircle,
  Scissors,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { DIAS_DE_TESTE } from '../../lib/planos'

/**
 * Página de vendas — onde o anúncio e a prospecção caem.
 *
 * Fora do CRM e sem autenticação: quem chega aqui não tem conta. Todo caminho
 * leva ao mesmo lugar (`/criar-conta`), porque uma página com dois objetivos
 * não converte em nenhum.
 *
 * **Regra ao mexer no texto:** só entra o que o sistema faz hoje. Nada de site
 * institucional, recuperação de clientes ou relatório avançado — são coisas da
 * visão que não existem, e prometê-las aqui vira reclamação no primeiro dia de
 * uso. Os preços saem de `plans`; se a tabela mudar, este texto precisa mudar
 * junto.
 */
function Secao({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`px-5 py-12 sm:py-16 ${className}`}>{children}</section>
}

export function VendasPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Topo */}
      <header className="px-5 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
            <Scissors size={17} />
          </span>
          <span className="font-semibold text-foreground">Club Cut</span>
        </div>
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Entrar
        </Link>
      </header>

      {/* Promessa */}
      <Secao className="max-w-2xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
          Sua barbearia responde no WhatsApp e agenda sozinha
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          O cliente manda mensagem, o atendimento automático conversa com ele, oferece os horários
          livres e marca na agenda. Você fica cortando cabelo.
        </p>
        <Link
          to="/criar-conta"
          className="mt-7 inline-block btn-primary rounded-lg px-6 py-3.5 text-base font-semibold"
        >
          Testar {DIAS_DE_TESTE} dias grátis
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">
          Sem cartão. Sem instalar nada. Leva um minuto.
        </p>
      </Secao>

      {/* O problema, na língua do dono */}
      <Secao className="bg-surface">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-foreground">Você conhece esse dia</h2>
          <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li>
              Está com a máquina na mão e o celular toca. Ou você para o corte, ou o cliente espera
              — e às vezes desiste.
            </li>
            <li>
              Marcou alguém às 15h. Às 15h20 a cadeira continua vazia, e aquele horário não volta.
            </li>
            <li>
              Alguém perguntou o preço da barba às 22h. Você respondeu no dia seguinte, e ele já
              tinha cortado em outro lugar.
            </li>
          </ul>
        </div>
      </Secao>

      {/* O que faz */}
      <Secao className="max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold text-foreground text-center">O que o Club Cut faz</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {[
            {
              icone: MessageCircle,
              titulo: 'Atende no WhatsApp, sozinho',
              texto:
                'Responde preço, horário e o que a barbearia faz. Marca, remarca e cancela — a qualquer hora, inclusive de madrugada e no domingo.',
            },
            {
              icone: CalendarCheck,
              titulo: 'Agenda que não deixa furo',
              texto:
                'O horário de cada barbeiro, o tempo de cada serviço, e nada marcado por cima de nada. O que o agente marca aparece na hora.',
            },
            {
              icone: Smartphone,
              titulo: 'Lembra o cliente antes',
              texto:
                'Uma hora antes ele recebe um lembrete e confirma se vem. Dez minutos antes, um "está a caminho?". Menos cadeira vazia.',
            },
            {
              icone: Wallet,
              titulo: 'O dinheiro do dia, fechado',
              texto:
                'Comanda, caixa e a comissão de cada barbeiro calculada sozinha. Você fecha o dia sabendo quanto entrou.',
            },
          ].map((f) => (
            <div key={f.titulo} className="rounded-xl border border-border bg-surface p-5">
              <f.icone size={20} className="text-primary" />
              <h3 className="mt-2.5 font-semibold text-foreground">{f.titulo}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.texto}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* Como começa */}
      <Secao className="bg-surface">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-foreground">Como começa</h2>
          <ol className="mt-5 space-y-4">
            {[
              ['Crie sua conta', 'E-mail e senha. Você confirma pelo e-mail e já entra.'],
              [
                'Conecte seu WhatsApp',
                'Você lê um QR code com o celular da barbearia — o mesmo número que seus clientes já usam. Não precisa de número novo.',
              ],
              [
                'Ajuste o que não servir',
                'A barbearia já vem com horário e serviços preenchidos. Você muda preço, duração e horário em dois minutos.',
              ],
            ].map(([titulo, texto], i) => (
              <li key={titulo} className="flex gap-3.5">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0">
                  {i + 1}
                </span>
                <div>
                  <div className="font-medium text-foreground">{titulo}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{texto}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Secao>

      {/* Preço */}
      <Secao className="max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold text-foreground text-center">Quanto custa</h2>
        <p className="mt-2 text-sm text-muted-foreground text-center">
          Uma cadeira vazia por semana já custa mais que isso.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-6">
            <div className="font-semibold text-foreground">Básico</div>
            <div className="mt-1 text-3xl font-bold text-foreground">
              R$ 197<span className="text-base font-normal text-muted-foreground">/mês</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {['Atendimento automático no WhatsApp', 'Agenda e clientes', 'Financeiro e comissão', 'Catálogo de serviços'].map(
                (i) => (
                  <li key={i} className="flex gap-2">
                    <Check size={16} className="text-success shrink-0 mt-0.5" />
                    {i}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="rounded-xl border-2 border-primary p-6 relative">
            <span className="absolute -top-2.5 left-6 bg-primary text-primary-foreground text-[11px] font-semibold px-2 py-0.5 rounded">
              Mais escolhido
            </span>
            <div className="font-semibold text-foreground">Pro</div>
            <div className="mt-1 text-3xl font-bold text-foreground">
              R$ 299<span className="text-base font-normal text-muted-foreground">/mês</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Check size={16} className="text-success shrink-0 mt-0.5" />
                Tudo do Básico
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-success shrink-0 mt-0.5" />
                <span>
                  <strong className="text-foreground">Lembrete 1h antes</strong>, perguntando se o
                  cliente confirma
                </span>
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-success shrink-0 mt-0.5" />
                <span>
                  <strong className="text-foreground">Confirmação 10 min antes</strong>, para você
                  saber do atraso antes da cadeira esfriar
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-7 text-center">
          <Link
            to="/criar-conta"
            className="inline-block btn-primary rounded-lg px-6 py-3.5 text-base font-semibold"
          >
            Testar {DIAS_DE_TESTE} dias grátis
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            No teste você usa o Pro completo. Cancela quando quiser, sem multa.
          </p>
        </div>
      </Secao>

      {/* Dúvidas que travam a decisão */}
      <Secao className="bg-surface">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-foreground">Perguntas que todo dono faz</h2>
          <div className="mt-5 space-y-5 text-sm">
            {[
              [
                'Preciso de um número novo de WhatsApp?',
                'Não. Você usa o número que a barbearia já tem. É só ler um QR code, como no WhatsApp Web.',
              ],
              [
                'E se eu quiser responder eu mesmo?',
                'É só responder. O atendimento automático percebe e sai da frente naquela conversa, até você devolver para ele.',
              ],
              [
                'O cliente vai perceber que é automático?',
                'Se ele perguntar, o atendimento assume que é automático — a gente não acha certo enganar o seu cliente. Fora isso, ele escreve como gente.',
              ],
              [
                'Tem fidelidade?',
                `Não. São ${DIAS_DE_TESTE} dias grátis sem cartão, e depois você cancela quando quiser pelo próprio sistema. Se cancelar, usa até o fim do mês que já pagou.`,
              ],
              [
                'Funciona com mais de um barbeiro?',
                'Sim. Cada um tem o próprio horário e a própria comissão, e o cliente pode escolher com quem quer cortar.',
              ],
            ].map(([p, r]) => (
              <div key={p}>
                <div className="font-medium text-foreground">{p}</div>
                <div className="text-muted-foreground mt-1">{r}</div>
              </div>
            ))}
          </div>
        </div>
      </Secao>

      {/* Fecho */}
      <Secao className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold text-foreground">
          Experimente com a sua agenda de verdade
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Em {DIAS_DE_TESTE} dias dá tempo de ver o lembrete evitando uma falta.
        </p>
        <Link
          to="/criar-conta"
          className="mt-6 inline-block btn-primary rounded-lg px-6 py-3.5 text-base font-semibold"
        >
          Criar minha conta grátis
        </Link>
      </Secao>

      <footer className="px-5 py-8 border-t border-border">
        <div className="max-w-2xl mx-auto flex flex-wrap gap-x-5 gap-y-2 justify-center text-sm text-muted-foreground">
          <Link to="/termos" className="hover:text-foreground">
            Termos de uso
          </Link>
          <Link to="/privacidade" className="hover:text-foreground">
            Privacidade
          </Link>
          <Link to="/login" className="hover:text-foreground">
            Entrar
          </Link>
        </div>
      </footer>
    </div>
  )
}
