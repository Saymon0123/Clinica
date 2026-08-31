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
          Você contrata o direito de usar o sistema enquanto as cobranças estiverem em dia — não
          compra o software nem recebe uma cópia dele.
        </p>
      </Secao>

      <Secao titulo="2. O que está incluído">
        <p>
          Não há planos nem níveis: <strong>todo cliente tem acesso a tudo</strong> — o CRM completo
          (agenda, clientes, financeiro e catálogo), o atendimento automático pelo WhatsApp que
          conversa com seus clientes e marca horários, os lembretes de agendamento e as demais
          automações que o sistema oferecer.
        </p>
        <p>
          O atendimento pelo WhatsApp depende de conectar o número da sua barbearia, o que é feito
          junto com a nossa equipe na entrada. O número é seu e continua sendo seu.
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

      <Secao titulo="4. Preço: você paga pelo que usa">
        <p>
          A cobrança é{' '}
          <strong>por agendamento criado pelo atendimento automático do WhatsApp</strong>, pelo
          valor unitário informado na sua contratação. Não há mensalidade fixa nem valor mínimo:
          mês sem agendamentos pelo WhatsApp é mês sem cobrança.
        </p>
        <p>
          Conta como agendamento cobrável o que o atendimento automático criar,{' '}
          <strong>mesmo que ele seja cancelado depois</strong> — o serviço de marcar foi prestado.
          Remarcar um horário já criado não gera nova cobrança, e agendamentos feitos por você
          direto no sistema ou pelo QR do balcão não são cobrados.
        </p>
        <p>
          Lembretes, confirmações e mensagens de reativação <strong>não têm custo</strong> para
          você. O painel de Assinatura mostra, a qualquer momento, o uso do mês e quanto ele
          representa.
        </p>
        <p>
          O período de cobrança é o mês-calendário: fechamos no último dia e a cobrança do que foi
          usado chega em seguida, com o detalhamento. O valor unitário pode ser reajustado com
          aviso de pelo menos 30 dias de antecedência.
        </p>
      </Secao>

      <Secao titulo="5. Cancelamento">
        <p>
          Você pode cancelar quando quiser, pelo próprio sistema, sem multa e sem prazo mínimo. No
          cancelamento o período em aberto é fechado na hora, e a última cobrança traz{' '}
          <strong>somente o que foi usado até o dia do cancelamento</strong>. O acesso segue até o
          fim do período já pago.
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

      <Secao titulo="7. O atendimento automático é feito por inteligência artificial">
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

      <Secao titulo="8. Sobre o WhatsApp">
        <p>
          O atendimento automático conversa com seus clientes <strong>pelo número da sua
          barbearia</strong>, conectado ao sistema por pareamento (QR code). Avisos automáticos —
          como lembretes e confirmações de horário — são enviados por um número do Club Cut na{' '}
          <strong>API oficial do WhatsApp (Meta)</strong>, sempre identificando a sua barbearia na
          mensagem. O WhatsApp é um serviço da Meta, sujeito às políticas dela: a Meta pode
          restringir ou suspender números, a critério dela, e nesse caso o atendimento ou os avisos
          deixam de funcionar até a situação ser resolvida. Não respondemos por decisões da Meta, e
          vamos ajudar você a regularizar sempre que acontecer.
        </p>
        <p>
          Mensagens que o sistema envia por iniciativa própria (como lembretes) usam modelos
          aprovados pela Meta, como as regras dela exigem.
        </p>
      </Secao>

      <Secao titulo="9. Disponibilidade, backup e suporte">
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

      <Secao titulo="10. Seus dados e os dados dos seus clientes">
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

      <Secao titulo="11. O software é nosso">
        <p>
          O sistema, seu código e sua identidade visual pertencem ao Club Cut. Você recebe o direito
          de usá-lo enquanto seu acesso estiver ativo, e nada além disso.
        </p>
      </Secao>

      <Secao titulo="12. Mudanças nestes termos">
        <p>
          Se estes termos mudarem, publicamos uma versão nova e avisamos você. O registro do seu
          aceite guarda a versão que você leu, com data e hora — mudar o texto não altera o que você
          aceitou.
        </p>
      </Secao>
    </LegalLayout>
  )
}
