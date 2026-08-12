# Contrato e conformidade — o que foi decidido

Levantamento feito em 2026-08-12, olhando o que o sistema **de fato faz**.
Contrato bom descreve comportamento real; prometer o que o código não cumpre é
pior do que não prometer.

Este documento **não é o contrato**. É a lista do que ele precisa conter e as
decisões já tomadas, para o advogado redigir sem precisar reconstruir o produto
a partir de conversa.

---

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Backup | Não há hoje. O contrato declara isso e assume prazo para passar a haver |
| Emissão de NF | Há CNPJ; a emissão entra no fluxo, com prazo |
| Bloqueio do WhatsApp pela Meta | Sem responsabilidade indenizatória, com compromisso de auxiliar na reconexão |
| Uso de dados para melhorar o produto | Somente agregados e anonimizados |
| Acesso a conteúdo de conversa | Permitido para operar, dar suporte e auditar qualidade — cláusula **separada** da anterior |
| Suporte | WhatsApp, resposta em até 1 dia útil (prazo de resposta, não de solução) |
| Reajuste | Anual pelo IPCA, com aviso de 30 dias |
| Retenção de conversas | 12 meses, com descarte automático |
| Dados de crianças | Obrigação da barbearia, declarada em contrato |

Duas dessas decisões **criam trabalho que ainda não existe**:

- **descarte automático aos 12 meses** — não há rotina nenhuma apagando
  mensagem hoje; a mais antiga é de 2026-08-02 e nada foi removido
- **backup com prazo declarado** — o Supabase está no plano gratuito, sem
  backup gerenciado; a data prometida vira obrigação contratual

---

## O que o contrato precisa conter

### Objeto
Licença de uso de software como serviço. Não é venda de software nem prestação
de serviço de barbearia.

### Planos — o código diferencia de verdade

| | Básico R$ 197 | Pro R$ 299 |
|---|---|---|
| CRM: agenda, clientes, financeiro, catálogo | sim | sim |
| Agente de WhatsApp que atende e agenda | sim | sim |
| Lembrete 1h antes e confirmação 10 min antes | não | sim |

Com a ressalva de que o WhatsApp depende de o número da barbearia ser conectado
por leitura de QR code, e o número é fornecido por ela.

### Preço
`subscriptions.valor` é **congelado no cadastro**: quem assinou antes de um
reajuste continua pagando o contratado. Isso já é comportamento do código — sem
estar escrito, vira discussão no primeiro reajuste.

### Teste grátis
7 dias, sem cartão, contados do **primeiro acesso** — não da criação do convite
(ver `admin-invite-salon` e a migration `0050`).

### Cancelamento
A qualquer tempo. O acesso segue até o fim do período pago, sem reembolso
proporcional. É o que a ação `cancelar` da função `asaas` faz.

### Inadimplência — a regra dos 3 dias
Vencido o acesso, o CRM bloqueia imediatamente e **o agente continua atendendo
os clientes da barbearia por mais 3 dias** (`salons_atendendo`, migration
`0040`). Depois disso, para. Precisa estar escrito porque afeta terceiros: um
cliente que mande mensagem no quarto dia não é respondido.

### Troca de plano
Subir custa a diferença proporcional aos dias restantes e vale quando o
pagamento é confirmado, não no clique. Descer vale na renovação, sem devolução.

### Dados
- **Papéis:** barbearia é controladora; o fornecedor é operador.
- **Tratado:** nome, telefone, aniversário e observações dos clientes;
  conteúdo das conversas de WhatsApp; agendamentos; movimento financeiro.
- **Suboperadores:** Supabase (banco, região São Paulo), Vercel, OpenAI
  (Estados Unidos), Asaas, Evolution API em servidor Hostinger, n8n.
- **Transferência internacional:** áudio e imagem enviados pelo cliente vão
  para a OpenAI, para transcrição e descrição.
- **Acesso a conteúdo:** o fornecedor lê conversas para suporte e auditoria.
- **Obrigação da barbearia:** informar os próprios clientes, ter base legal, e
  responder pelo consentimento dos pais quando o atendido for criança — o
  catálogo padrão tem serviços infantis.
- **Incidente de segurança:** prazo para comunicar.
- **Fim do contrato:** o que é devolvido, em que formato, e quando é eliminado.

### A IA — limite de responsabilidade
O agente marca, remarca e cancela sozinho, e pode errar. A barbearia deve
conferir a agenda; a responsabilidade por atendimento não prestado é dela.

A fronteira definida em [`visao.md`](visao.md) — o que o agente nunca faz —
entra como **anexo**. Além de delimitar, serve como prova de diligência.

### WhatsApp — cláusula em destaque
O canal não é oficial da Meta. O número pode ser bloqueado e o atendimento
automático para. Pelo CDC (art. 54, §4º), cláusula limitativa precisa de
destaque; esta é a principal do contrato.

### Propriedade
O software é do fornecedor; os dados são da barbearia.

### Aceite
Eletrônico, no aceite do convite (`/convite/:token`), com registro de quem
aceitou, quando, de qual IP e **qual versão** do texto. Sem o registro existe o
termo, mas não a prova de que aquela pessoa aceitou aquele texto.

---

## Por que o aceite eletrônico basta

Não é contorno: contrato só exige forma específica quando a lei diz (CC, art.
104 e 107), e licença de software não exige. O clique é um contrato de adesão
válido. O que faz valer numa disputa:

1. apresentado **antes** do pagamento (CDC, art. 46)
2. ato afirmativo — caixa desmarcada que a pessoa marca, não "ao continuar você
   concorda" no rodapé
3. registro de quem, quando e qual versão
4. cláusula limitativa em destaque (CDC, art. 54, §4º)

**O que o aceite não resolve:** ele vale com quem clica — o dono. Os clientes
das barbearias nunca verão este termo. Com eles a relação é da barbearia, e é
por isso que o contrato precisa da parte de controlador/operador, que um termo
comum de SaaS não tem.
