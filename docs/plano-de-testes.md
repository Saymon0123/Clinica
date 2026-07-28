# Plano de testes — Salão CRM

Roteiro completo, em ordem de dependência: cada fase usa o que a anterior criou.

**Como usar:** marque `[x]` no que passar. No que falhar, escreva o que aconteceu
na linha `Erro:` logo abaixo — quanto mais específico (mensagem na tela, o que
você clicou, qual conta), mais rápido eu corrijo.

**Sempre use** `https://clinica-crm-kappa.vercel.app`. Nunca as URLs com hash
(`clinica-<código>-...`), que ficam congeladas num build antigo.

---

## FASE 0 — Preparação

Sem isso, várias fases adiante não têm como passar.

- [ ] **0.1** Secrets do Asaas cadastrados no Supabase: `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN`
      Erro:
- [ ] **0.2** Avisar que os secrets estão prontos, para eu publicar `asaas-checkout` e `asaas-webhook`
      Erro:
- [ ] **0.3** Secret `N8N_WEBHOOK_URL` cadastrado
      Erro:
- [ ] **0.4** Variável `VITE_APP_URL` na Vercel + redeploy feito
      Erro:
- [ ] **0.5** Abrir o CRM em aba anônima e confirmar que carrega
      Erro:

---

## FASE 1 — Cadastro e acesso

- [ ] **1.1** Abrir `/admin/nova-barbearia` → pede a senha de ADM
      Erro:
- [ ] **1.2** Senha errada → recusa
      Erro:
- [ ] **1.3** Senha certa → entra na ferramenta
      Erro:
- [ ] **1.4** Cadastrar **barbearia avulsa** com e-mail novo → mostra senha temporária
      Erro:
- [ ] **1.5** Tentar cadastrar com e-mail que já existe → erro claro, nada é criado
      Erro:
- [ ] **1.6** Deixar endereço em branco → recusa com mensagem
      Erro:
- [ ] **1.7** Entrar no CRM com o login criado em 1.4
      Erro:
- [ ] **1.8** Ferramenta admin: listar barbearias, editar nome/endereço, desativar e reativar
      Erro:
- [ ] **1.9** Barbearia desativada → o dono dela não consegue mais usar o CRM
      Erro:
- [ ] **1.10** Login com senha errada → mensagem clara, sem travar
      Erro:
- [ ] **1.11** "Esqueci a senha" → e-mail chega e o link abre a tela de redefinir
      Erro:
- [ ] **1.12** Redefinir a senha e entrar com a nova
      Erro:

---

## FASE 2 — Catálogo

Use a barbearia avulsa criada na fase 1.

- [ ] **2.1** Criar serviço (nome, duração, preço)
      Erro:
- [ ] **2.2** Editar serviço
      Erro:
- [ ] **2.3** Desativar e reativar serviço
      Erro:
- [ ] **2.4** Criar produto com estoque e estoque mínimo
      Erro:
- [ ] **2.5** Produto com estoque abaixo do mínimo → aparece marcado como "baixo"
      Erro:
- [ ] **2.6** Editar e desativar produto
      Erro:

---

## FASE 3 — Agenda

- [ ] **3.1** Criar reserva com cliente novo (digitando o nome)
      Erro:
- [ ] **3.2** O cliente digitado aparece na aba Clientes
      Erro:
- [ ] **3.3** Criar reserva clicando direto num horário vago da grade
      Erro:
- [ ] **3.4** Arrastar o agendamento para outro horário → salva
      Erro:
- [ ] **3.5** Arrastar para cima de outro agendamento do mesmo barbeiro → **recusa** com aviso de conflito
      Erro:
- [ ] **3.6** Abrir o agendamento → "Alterar data/horário" funciona
      Erro:
- [ ] **3.7** Alterar para um horário já ocupado → recusa com aviso de conflito
      Erro:
- [ ] **3.8** Cancelar agendamento → some da grade
      Erro:
- [ ] **3.9** Excluir agendamento (com a confirmação)
      Erro:
- [ ] **3.10** Navegar entre dias com as setas e pelo mini-calendário
      Erro:
- [ ] **3.11** Criar dois serviços diferentes e conferir que **só os barbeiros que executam** aparecem ao escolher cada um
      Erro:

---

## FASE 4 — Clientes

- [ ] **4.1** Cadastrar cliente manualmente
      Erro:
- [ ] **4.2** Editar cliente
      Erro:
- [ ] **4.3** Abrir o cadastro → histórico de agendamentos e compras
      Erro:
- [ ] **4.4** Exportar CSV
      Erro:
- [ ] **4.5** Importar CSV (use o arquivo exportado como base)
      Erro:
- [ ] **4.6** Contagem de clientes novos por período bate com a realidade
      Erro:
- [ ] **4.7** Buscar cliente pelo nome
      Erro:

---

## FASE 5 — Venda, caixa e comissão

- [ ] **5.1** Definir comissão de um barbeiro na aba Equipe
      Erro:
- [ ] **5.2** Abrir o caixa com troco inicial
      Erro:
- [ ] **5.3** Agenda → "Concluir e cobrar" → abre a venda já preenchida
      Erro:
- [ ] **5.4** Fechar a venda com pagamento **em dinheiro**
      Erro:
- [ ] **5.5** O agendamento passa a "concluído"
      Erro:
- [ ] **5.6** Vender produto → estoque baixa
      Erro:
- [ ] **5.7** Tentar vender mais produto do que tem em estoque → recusa
      Erro:
- [ ] **5.8** Venda avulsa (sem vir da agenda), com serviço + produto juntos
      Erro:
- [ ] **5.9** Caixa: "em dinheiro" e "esperado" batem com as vendas em dinheiro
      Erro:
- [ ] **5.10** Fechar o caixa com o valor exato → "Bateu certinho"
      Erro:
- [ ] **5.11** Abrir outro caixa, vender, e conferir que **não soma** as vendas do caixa anterior
      Erro:
- [ ] **5.12** Fechar caixa com valor diferente → mostra sobrando/faltando corretamente
      Erro:
- [ ] **5.13** Financeiro → "Fechar comissões" → valor bate com o percentual do barbeiro
      Erro:
- [ ] **5.14** Marcar comissão como paga → muda para "já pago"
      Erro:

---

## FASE 6 — Financeiro

- [ ] **6.1** Faturamento do dia e do mês batem com as vendas feitas
      Erro:
- [ ] **6.2** Cards de clientes atendidos, agendamentos e cancelamentos conferem
      Erro:
- [ ] **6.3** Alternar entre "Hoje" e "Este mês" muda os números
      Erro:
- [ ] **6.4** Editar a meta de faturamento
      Erro:
- [ ] **6.5** Bater a meta → aparece a comemoração (uma vez só)
      Erro:
- [ ] **6.6** Serviços mais vendidos reflete o que foi vendido
      Erro:
- [ ] **6.7** Exportar relatório por mês
      Erro:
- [ ] **6.8** Exportar relatório por semana
      Erro:
- [ ] **6.9** Aba Vendas lista as comandas com cliente, profissional e forma de pagamento
      Erro:

---

## FASE 7 — Pacotes pré-pagos

- [ ] **7.1** Catálogo → aba Pacotes → criar pacote (ex: 5 cortes por R$ 150)
      Erro:
- [ ] **7.2** Ao montar, o desconto e o "valor por atendimento" aparecem corretos
      Erro:
- [ ] **7.3** Colocar preço maior que o avulso → avisa em vermelho
      Erro:
- [ ] **7.4** Criar pacote sem validade e outro com validade
      Erro:
- [ ] **7.5** PDV → vender o pacote para um cliente
      Erro:
- [ ] **7.6** Abrir o cadastro do cliente → mostra "Pacote ativo" com saldo e validade
      Erro:
- [ ] **7.7** Abrir um agendamento desse cliente → etiqueta verde com o saldo
      Erro:
- [ ] **7.8** PDV com esse cliente → aparece a faixa verde avisando do pacote
      Erro:
- [ ] **7.9** Adicionar o serviço coberto → entra **zerado** e marcado "pago pelo pacote"
      Erro:
- [ ] **7.10** Fechar a venda → o saldo baixa em 1
      Erro:
- [ ] **7.11** Pedir mais unidades do que o saldo → o excedente entra **cobrado**
      Erro:
- [ ] **7.12** Excluir essa venda → **o crédito volta**
      Erro:
- [ ] **7.13** Fechamento de comissão → o atendimento pelo pacote **não fica zerado**
      Erro:
- [ ] **7.14** Desativar o pacote → some da venda, mas quem comprou continua usando
      Erro:
- [ ] **7.15** Editar o preço do pacote → quem já comprou mantém o valor antigo
      Erro:

---

## FASE 8 — Equipe e convites

- [ ] **8.1** Convidar um **barbeiro** (nome, e-mail, comissão)
      Erro:
- [ ] **8.2** Copiar o link e conferir que começa com `clinica-crm-kappa.vercel.app`
      Erro:
- [ ] **8.3** Abrir o link em aba anônima → mostra os dados do convite
      Erro:
- [ ] **8.4** Criar a senha e entrar como barbeiro
      Erro:
- [ ] **8.5** Convidar usando um e-mail **que já existe** → ao aceitar, avisa e orienta a pedir troca
      Erro:
- [ ] **8.6** Trocar o e-mail do convite pendente → o mesmo link passa a valer para o novo e-mail
      Erro:
- [ ] **8.7** Cancelar convite pendente → o link para de funcionar
      Erro:
- [ ] **8.8** Convidar um **gerente** e entrar com essa conta
      Erro:
- [ ] **8.9** Definir horário de trabalho de um barbeiro (dias e horas)
      Erro:
- [ ] **8.10** Desativar e reativar um barbeiro
      Erro:

---

## FASE 9 — Permissões (a fase mais importante)

Faça login com **cada conta** e confira o que aparece.

### Como barbeiro

- [ ] **9.1** Menu mostra **apenas** Agenda, Financeiro e Catálogo
      Erro:
- [ ] **9.2** Agenda mostra **só os agendamentos dele**
      Erro:
- [ ] **9.3** Financeiro mostra só os números dele, sem meta nem exportação
      Erro:
- [ ] **9.4** Catálogo: consegue **criar** serviço
      Erro:
- [ ] **9.5** Serviço criado pelo gestor aparece como "Da gestão", **sem** editar/desativar
      Erro:
- [ ] **9.6** Consegue editar e apagar **o serviço que ele criou**
      Erro:
- [ ] **9.7** Consegue criar agendamento e fechar comanda
      Erro:
- [ ] **9.8** Digitar `/clientes` na URL → não acessa dados de outros
      Erro:
- [ ] **9.9** Digitar `/rede` na URL → redireciona para a agenda
      Erro:
- [ ] **9.10** Digitar `/equipe` ou `/conexao` na URL → sem acesso
      Erro:

### Como gerente

- [ ] **9.11** Vê todas as abas da unidade **exceto** Rede, Equipe da rede e Assinatura
      Erro:
- [ ] **9.12** Consegue editar catálogo, clientes e equipe
      Erro:
- [ ] **9.13** Digitar `/rede` na URL → redireciona
      Erro:
- [ ] **9.14** Vê os dados de **todos** os barbeiros da unidade
      Erro:
- [ ] **9.15** **Não** vê dados de outra unidade da rede
      Erro:

### Como dono

- [ ] **9.16** Vê todas as abas
      Erro:
- [ ] **9.17** Assinatura aparece no menu
      Erro:

---

## FASE 10 — Rede

Use o login `saymoncastro@gmail.com`.

- [ ] **10.1** Ao entrar sem unidade escolhida, o menu mostra **só Rede** e cai no painel
      Erro:
- [ ] **10.2** Ícone de perfil abre sem cortar o texto (desktop e celular)
      Erro:
- [ ] **10.3** Trocar de barbearia pelo perfil → o CRM inteiro acompanha
      Erro:
- [ ] **10.4** Escolhida a unidade, o restante do menu aparece
      Erro:
- [ ] **10.5** "Painel da rede" no menu de perfil volta para o painel
      Erro:
- [ ] **10.6** Números da rede batem com a soma das unidades
      Erro:
- [ ] **10.7** Gráfico de faturamento por dia mostra as vendas
      Erro:
- [ ] **10.8** Comparativo por unidade e "Abrir" funcionam
      Erro:
- [ ] **10.9** Produção por barbeiro aparece com faturamento, ticket e comissão
      Erro:
- [ ] **10.10** Alternar Semana / Mês muda os números
      Erro:
- [ ] **10.11** Criar unidade nova pelo botão, com cópia do catálogo
      Erro:
- [ ] **10.12** Equipe da rede lista as pessoas de cada unidade
      Erro:
- [ ] **10.13** Trocar a função de alguém (barbeiro ↔ gerente) → o acesso muda de verdade
      Erro:
- [ ] **10.14** Tentar rebaixar o único dono de uma unidade → **recusa** com aviso
      Erro:
- [ ] **10.15** Rebaixar a si mesmo → pede confirmação
      Erro:

---

## FASE 11 — WhatsApp e agente

Depende dos secrets da fase 0.

- [ ] **11.1** Conexão → "Conectar" gera o QR code
      Erro:
- [ ] **11.2** **Não** aparece o aviso amarelo de webhook (se aparecer, o secret está errado)
      Erro:
- [ ] **11.3** Ler o QR com o WhatsApp da barbearia → status vira "conectado"
      Erro:
- [ ] **11.4** Trocar de unidade e conectar **outro número** → as duas ficam independentes
      Erro:
- [ ] **11.5** Mandar mensagem de outro número → o agente responde
      Erro:
- [ ] **11.6** Pedir para agendar → o agente pergunta o serviço e oferece horários
      Erro:
- [ ] **11.7** Agendamento criado pelo agente aparece na agenda do CRM
      Erro:
- [ ] **11.8** O agente **não oferece** horário fora do funcionamento da barbearia
      Erro:
- [ ] **11.9** O agente **não oferece** horário em dia de folga do barbeiro
      Erro:
- [ ] **11.10** O agente **não oferece** horário já ocupado
      Erro:
- [ ] **11.11** Pedir para cancelar → o agente cancela e some da agenda
      Erro:
- [ ] **11.12** Pedir para falar com o dono → conversa vai para "precisa de humano" com resumo
      Erro:
- [ ] **11.13** Aba WEB → responder manualmente → o agente **pausa**
      Erro:
- [ ] **11.14** "Devolver ao agente" → volta a responder
      Erro:
- [ ] **11.15** Cliente já cadastrado → o agente **não pergunta** o telefone nem o nome
      Erro:
- [ ] **11.16** Mandar áudio → o agente entende
      Erro:
- [ ] **11.17** Dashboard do agente mostra conversas, tempo de resposta e agendamentos
      Erro:
- [ ] **11.18** Desconectar o WhatsApp
      Erro:

---

## FASE 12 — Assinatura (Asaas)

Depende da publicação das funções (0.2).

- [ ] **12.1** Aba Assinatura mostra os dois planos com preço
      Erro:
- [ ] **12.2** Em rede, o preço aparece com desconto por unidade
      Erro:
- [ ] **12.3** Assinar → pede CPF/CNPJ
      Erro:
- [ ] **12.4** CPF inválido → recusa
      Erro:
- [ ] **12.5** Assinar → devolve o link de pagamento do Asaas
      Erro:
- [ ] **12.6** Pagar no sandbox → status vira "Ativa" sozinho (webhook)
      Erro:
- [ ] **12.7** Trocar de plano → não fica com duas cobranças
      Erro:

---

## FASE 13 — Aparência e dispositivos

- [ ] **13.1** Celular: barra flutuante com pílula no item ativo
      Erro:
- [ ] **13.2** Celular: botão "Mais" abre a gaveta
      Erro:
- [ ] **13.3** Celular: nenhum conteúdo fica escondido atrás da barra
      Erro:
- [ ] **13.4** Alternar tema claro/escuro em todas as telas
      Erro:
- [ ] **13.5** Desktop: sidebar completa e menu de perfil sem corte
      Erro:
- [ ] **13.6** Celular na horizontal
      Erro:
- [ ] **13.7** Tabelas largas rolam sem estourar a tela
      Erro:

---

## Registro de erros

Para cada falha, anote aqui:

```
ITEM: 
O QUE FIZ: 
O QUE ESPERAVA: 
O QUE ACONTECEU: 
CONTA USADA: 
DISPOSITIVO: 
```

---

## O que NÃO dá para testar ainda

Não são falhas — simplesmente não foram construídos:

- Recuperação de clientes sumidos (recurso do plano Pro)
- Site da barbearia (recurso do plano Pro)
- Mensagens automáticas de pacote (recibo, saldo baixo, vencimento)
- Lembrete de agendamento — o fluxo existe, mas está **inativo** de propósito
- Bloqueio por plano — construído, porém desligado
- Tela de estoque e agendamento recorrente
- Convite por e-mail (hoje é link copiável)
