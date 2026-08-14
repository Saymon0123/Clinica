import { LegalLayout, Secao } from './LegalLayout'
import { DIAS_DE_TESTE } from '../../lib/planos'

/**
 * Minuta dos termos de uso.
 *
 * Cada cláusula descreve um comportamento que o sistema **de fato** tem —
 * prometer o que o código não cumpre é pior do que não prometer, e o contrário
 * também vale: o valor congelado e a regra dos 3 dias existem no código e, sem
 * estarem escritos, viravam discussão no primeiro desentendimento.
 *
 * O levantamento que originou este texto está em `docs/contrato.md`.
 */
export function TermosPage() {
  return (
    <LegalLayout titulo="Termos de uso">
      <Secao titulo="1. O que é o Club Cut">
        <p>
          O Club Cut é um sistema de gestão para barbearias, oferecido como serviço pela internet.
          Você contrata o direito de usar o sistema enquanto a assinatura estiver em dia — não
          compra o software nem recebe uma cópia dele.
        </p>
      </Secao>

      <Secao titulo="2. O que cada plano inclui">
        <p>
          O <strong>Básico</strong> dá acesso ao CRM completo — agenda, clientes, financeiro e
          catálogo — e ao atendimento automático pelo WhatsApp, que conversa com seus clientes e
          marca horários.
        </p>
        <p>
          O <strong>Pro</strong> inclui tudo do Básico e acrescenta o lembrete enviado cerca de uma
          hora antes do horário e o pedido de confirmação cerca de dez minutos antes.
        </p>
        <p>
          O atendimento pelo WhatsApp depende de você conectar o número da sua barbearia, lendo um
          QR code. O número é seu e continua sendo seu.
        </p>
      </Secao>

      <Secao titulo="3. Teste grátis">
        <p>
          Quando houver teste, ele dura {DIAS_DE_TESTE} dias e não pede cartão. A contagem começa
          no{' '}
          <strong>seu primeiro acesso</strong>, não no dia em que o convite foi criado — se você
          demorar para entrar, não perde dias.
        </p>
      </Secao>

      <Secao titulo="4. Preço e reajuste">
        <p>
          A mensalidade é a do plano contratado e é cobrada mensalmente. O valor que você contratou
          fica registrado e <strong>não muda quando a tabela de preços muda</strong>: quem assinou
          antes de um aumento continua pagando o que contratou.
        </p>
        <p>
          O preço é reajustado uma vez por ano pelo IPCA, e você é avisado com pelo menos 30 dias de
          antecedência.
        </p>
      </Secao>

      <Secao titulo="5. Cancelamento">
        <p>
          Você pode cancelar quando quiser, pelo próprio sistema, sem multa e sem prazo mínimo. As
          cobranças futuras param na hora, e{' '}
          <strong>você continua usando até o fim do período que já pagou</strong>. Não há devolução
          proporcional dos dias não usados, porque o acesso a eles continua disponível.
        </p>
      </Secao>

      <Secao titulo="6. Atraso no pagamento">
        <p>
          Vencido o acesso, o CRM é bloqueado imediatamente — você continua conseguindo entrar na
          tela de assinatura para regularizar.
        </p>
        <p>
          <strong>
            O atendimento automático pelo WhatsApp continua funcionando por mais 3 dias
          </strong>{' '}
          e depois disso é interrompido. A partir daí, quem mandar mensagem para a sua barbearia não
          recebe resposta automática.
        </p>
      </Secao>

      <Secao titulo="7. Trocar de plano">
        <p>
          Ao subir de plano, você paga apenas a diferença proporcional aos dias que faltam no
          período atual, e o plano novo passa a valer quando esse pagamento é confirmado.
        </p>
        <p>
          Ao descer de plano, você continua no plano atual até o fim do período já pago, e a mudança
          vale na renovação. Não há devolução.
        </p>
      </Secao>

      <Secao titulo="8. O atendimento automático é feito por inteligência artificial">
        <p>
          O agente conversa com seus clientes, marca, remarca e cancela horários sozinho. Como
          qualquer sistema automático, ele pode errar — entender mal um pedido, oferecer um horário
          indevido ou deixar de registrar algo.
        </p>
        <p>
          <strong>
            Confira sua agenda. A responsabilidade pelo atendimento aos seus clientes é sua.
          </strong>{' '}
          Nós mantemos uma auditoria automática que procura falhas do agente e avisamos quando
          encontramos, mas isso não substitui a conferência.
        </p>
        <p>
          Há limites do que o agente nunca faz — não oferece desconto, não promete prazo ou
          resultado, não fala sobre saúde, não trata de horário de outro cliente. A lista completa
          faz parte destes termos.
        </p>
      </Secao>

      <Secao titulo="9. Sobre o WhatsApp">
        <p className="rounded-lg border border-border-strong bg-surface-2 p-3">
          <strong>Atenção — leia com cuidado.</strong> A conexão com o WhatsApp é feita por um canal
          que não é o oficial da Meta. Isso significa que{' '}
          <strong>o número da sua barbearia pode ser bloqueado ou banido pela Meta</strong>, a
          qualquer momento e por decisão dela, e que nesse caso o atendimento automático deixa de
          funcionar. Não temos como impedir nem prever isso, e não respondemos por prejuízos daí
          decorrentes. Vamos ajudar você a reconectar assim que possível.
        </p>
      </Secao>

      <Secao titulo="10. Disponibilidade, backup e suporte">
        <p>
          Trabalhamos para manter o sistema no ar o tempo todo, mas ele depende de serviços de
          terceiros e pode ficar indisponível por manutenção ou falha.
        </p>
        <p>
          <strong>Hoje não há backup gerenciado do banco de dados.</strong> Estamos providenciando
          isso e informaremos quando passar a existir. Até lá, não podemos garantir a recuperação de
          dados perdidos.
        </p>
        <p>
          O suporte é feito por WhatsApp, com resposta em até 1 dia útil. Esse é o prazo para
          responder, não necessariamente para resolver.
        </p>
      </Secao>

      <Secao titulo="11. Seus dados e os dados dos seus clientes">
        <p>
          Os dados da sua barbearia e dos seus clientes são <strong>seus</strong>. Nós apenas os
          tratamos para fazer o sistema funcionar. O detalhamento está na{' '}
          <a href="/privacidade" className="text-primary hover:underline">
            Política de Privacidade
          </a>
          , que faz parte destes termos.
        </p>
        <p>
          Você é responsável por informar seus próprios clientes sobre o uso do sistema e por ter
          respaldo legal para tratar os dados deles —{' '}
          <strong>
            inclusive o consentimento dos pais ou responsáveis quando o atendido for criança
          </strong>
          .
        </p>
      </Secao>

      <Secao titulo="12. O software é nosso">
        <p>
          O sistema, seu código e sua identidade visual pertencem ao Club Cut. Você recebe o direito
          de usá-lo enquanto a assinatura estiver ativa, e nada além disso.
        </p>
      </Secao>

      <Secao titulo="13. Mudanças nestes termos">
        <p>
          Se estes termos mudarem, publicamos uma versão nova e avisamos você. O registro do seu
          aceite guarda a versão que você leu, com data e hora — mudar o texto não altera o que você
          aceitou.
        </p>
      </Secao>
    </LegalLayout>
  )
}
