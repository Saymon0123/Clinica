import { LegalLayout, Secao } from './LegalLayout'

/**
 * Minuta da política de privacidade.
 *
 * Descreve o tratamento que o sistema realmente faz, incluindo o que é
 * desconfortável de escrever e por isso costuma ficar de fora: que o conteúdo
 * das conversas é lido para suporte e auditoria, e que áudio e imagem saem do
 * país.
 *
 * Escrita para ser lida também por um cliente da barbearia que recebeu o link
 * pelo WhatsApp — não só pelo dono.
 */
export function PrivacidadePage() {
  return (
    <LegalLayout titulo="Política de Privacidade">
      <Secao titulo="Quem é responsável pelo quê">
        <p>
          Quando uma barbearia usa o Club Cut, <strong>ela</strong> decide quais dados coleta dos
          próprios clientes e por quê — é a controladora. <strong>Nós</strong> tratamos esses dados
          seguindo as instruções dela, para fazer o sistema funcionar — somos o operador.
        </p>
        <p>
          Se você é cliente de uma barbearia e quer saber ou pedir algo sobre seus dados, fale
          primeiro com ela. Se preferir falar conosco, encaminhamos.
        </p>
      </Secao>

      <Secao titulo="O que o sistema guarda">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Dos clientes da barbearia:</strong> nome, telefone, data de aniversário quando
            informada, observações que a barbearia anotar, e o histórico de agendamentos e
            atendimentos.
          </li>
          <li>
            <strong>Das conversas de WhatsApp:</strong> o conteúdo das mensagens trocadas com o
            atendimento automático, e o número de telefone do contato.
          </li>
          <li>
            <strong>Da barbearia:</strong> nome, endereço, telefone, horário de funcionamento,
            catálogo de serviços, equipe, movimento financeiro e dados de cobrança da assinatura.
          </li>
        </ul>
      </Secao>

      <Secao titulo="Por quanto tempo">
        <p>
          As <strong>conversas de WhatsApp são apagadas após 12 meses</strong>. Os demais dados são
          mantidos enquanto durar o contrato com a barbearia.
        </p>
        <p>
          Encerrado o contrato, os dados são disponibilizados para exportação e depois eliminados,
          exceto o que a lei obrigue a guardar — registros fiscais, por exemplo.
        </p>
      </Secao>

      <Secao titulo="Quem mais tem acesso">
        <p>
          Para funcionar, o sistema usa serviços de terceiros. Cada um recebe apenas o necessário:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Supabase</strong> — banco de dados, com servidores no Brasil (São Paulo)
          </li>
          <li>
            <strong>Vercel</strong> — hospedagem do sistema que você acessa pelo navegador
          </li>
          <li>
            <strong>OpenAI</strong> — inteligência artificial do atendimento automático,{' '}
            <strong>com servidores nos Estados Unidos</strong>
          </li>
          <li>
            <strong>Asaas</strong> — cobrança da assinatura
          </li>
          <li>
            <strong>Hostinger e n8n</strong> — servidores que conectam o WhatsApp e executam as
            automações
          </li>
        </ul>
      </Secao>

      <Secao titulo="Áudio e imagem saem do país">
        <p>
          Quando um cliente manda um <strong>áudio</strong> ou uma <strong>foto</strong> no
          WhatsApp, esse conteúdo é enviado para a OpenAI, nos Estados Unidos, para ser transcrito
          ou descrito — é assim que o atendimento automático entende o que foi dito. O texto
          resultante fica guardado junto com a conversa.
        </p>
      </Secao>

      <Secao titulo="Nós lemos as conversas">
        <p>
          Precisamos ser diretos sobre isto:{' '}
          <strong>
            temos acesso ao conteúdo das conversas entre o atendimento automático e os clientes da
            barbearia
          </strong>
          . Usamos esse acesso em duas situações, e só nelas:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Suporte</strong> — quando a barbearia relata um problema e precisamos ver o que
            aconteceu.
          </li>
          <li>
            <strong>Auditoria de qualidade e segurança</strong> — uma verificação automática que
            procura erros do agente, como prometer um horário que não foi marcado ou falar algo que
            ele não deveria.
          </li>
        </ul>
        <p>
          Não usamos o conteúdo dessas conversas para nenhuma outra finalidade, e não o repassamos a
          ninguém.
        </p>
      </Secao>

      <Secao titulo="Como melhoramos o produto">
        <p>
          Usamos apenas <strong>dados agregados e anonimizados</strong> — números que não
          identificam ninguém, como quantos agendamentos foram feitos ou com que frequência o agente
          precisa da ajuda do dono. Nunca usamos dados que identifiquem uma pessoa para essa
          finalidade.
        </p>
      </Secao>

      <Secao titulo="Seus direitos">
        <p>
          A LGPD garante a você confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir
          exclusão e saber com quem foram compartilhados.
        </p>
        <p>
          Se você é cliente de uma barbearia, o pedido vai a ela, que é a controladora — e nós a
          atendemos. Se preferir falar direto conosco, escreva para{' '}
          <strong>castrocollin01@gmail.com</strong> e encaminhamos.
        </p>
      </Secao>

      <Secao titulo="Como pedir a exclusão dos seus dados">
        <p>
          Escreva para <strong>castrocollin01@gmail.com</strong> com o assunto{' '}
          <strong>Exclusão de dados</strong>, informando o <strong>nome</strong> e o{' '}
          <strong>telefone</strong> que você usa na barbearia. São eles que localizam o seu
          cadastro.
        </p>
        <p>
          Respondemos em até <strong>15 dias</strong> confirmando o que foi apagado. Se você é
          cliente de uma barbearia, avisamos a ela — que é a controladora dos seus dados — e a
          exclusão vale dos dois lados.
        </p>
        <p>
          <strong>O que não conseguimos apagar:</strong> registros de pagamento e documentos
          fiscais, que a lei obriga a guardar por prazo próprio. Nesses casos o dado deixa de ser
          usado para qualquer outra finalidade, e é descartado assim que o prazo legal termina.
        </p>
      </Secao>

      <Secao titulo="Crianças">
        <p>
          Barbearias atendem crianças. Quando o atendido for menor de 12 anos, cabe à barbearia
          obter o consentimento específico de um dos pais ou do responsável antes de cadastrar os
          dados, conforme o artigo 14 da LGPD.
        </p>
      </Secao>

      <Secao titulo="Segurança e incidentes">
        <p>
          O acesso aos dados é limitado por barbearia: cada uma enxerga apenas o que é seu, e isso é
          garantido no próprio banco de dados, não apenas na tela.
        </p>
        <p>
          Se acontecer um incidente de segurança que possa causar risco relevante, comunicamos a
          barbearia afetada e a ANPD, nos prazos da lei.
        </p>
      </Secao>
    </LegalLayout>
  )
}
