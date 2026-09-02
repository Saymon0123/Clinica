import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, Clock, Copy, Link2, Pencil, Percent, Plus, Power, Send, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { urlDoConvite } from '../../lib/appUrl'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { formatarTelefone, linkWhatsApp } from '../../lib/telefone'
import { Modal } from '../../components/Modal'
import { useAuth } from '../auth/AuthContext'
import { useSalon, type Papel } from '../auth/useSalon'
import { HorarioBarbeiroModal } from './HorarioBarbeiroModal'
import { toast } from '../../components/Toast'
import { Badge } from '../../components/Badge'
import { EstadoVazio } from '../../components/EstadoVazio'
import { SkeletonPagina, SkeletonLinhas } from '../../components/Skeleton'
import { Campo, Input, Select } from '../../components/Campo'
import { PageHeader } from '../../components/PageHeader'
import { ErroInline } from '../../components/ErroInline'

type Membro = {
  id: string
  nome: string
  telefone: string | null
  ativo: boolean
  comissao_percentual: number | null
  user_id: string | null
}

type Vinculo = { id: string; user_id: string; role: Papel }

const LABEL_PAPEL: Record<Papel, string> = {
  owner: 'Dono',
  gerente: 'Gerente',
  barbeiro: 'Barbeiro',
}

type Convite = {
  id: string
  // O convite de dono criado pela operação grava `nome` nulo e cai nesta mesma
  // lista. O tipo dizia `string` e mentia: a linha aparecia em branco e o
  // `window.confirm` de cancelar perguntava "Cancelar o convite de null?".
  nome: string | null
  email: string
  token: string
  role: string
  expira_em: string
  usado_em: string | null
}

/** O que a RPC `trocar_email_do_convite` (migration 0128) devolve. */
type ResultadoDaTroca = { novo_token: string; novo_prazo: string; trocou: boolean }

const linkDoConvite = urlDoConvite

/** Convite sem nome ainda precisa ser reconhecível: o e-mail identifica. */
function nomeDoConvite(c: Convite) {
  return c.nome?.trim() || c.email
}

export function EquipePage() {
  const { salonId, isManager, isOwner, loading: salonLoading, recarregarUnidades } = useSalon()
  const { user } = useAuth()
  const [membros, setMembros] = useState<Membro[]>([])
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [convites, setConvites] = useState<Convite[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [editandoEmail, setEditandoEmail] = useState<string | null>(null)
  const [emailRascunho, setEmailRascunho] = useState('')
  const [salvandoConvite, setSalvandoConvite] = useState<string | null>(null)
  // Aviso que FICA na linha do convite (id → texto), não toast: depois de
  // trocar o e-mail ou reenviar, o dono precisa ler com calma e copiar o link.
  // Três segundos de toast não dão isso.
  const [avisoDoConvite, setAvisoDoConvite] = useState<Record<string, string>>({})
  const [horarioDe, setHorarioDe] = useState<Membro | null>(null)
  const [editandoComissao, setEditandoComissao] = useState<string | null>(null)
  const [comissaoRascunho, setComissaoRascunho] = useState('')
  const [salvandoMembro, setSalvandoMembro] = useState<string | null>(null)
  // Tirar da equipe é irreversível pelo CRM: confirma antes, dizendo o nome.
  const [tirandoDaEquipe, setTirandoDaEquipe] = useState<{ vinculo: string; nome: string } | null>(null)

  const carregar = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    const [profsRes, convsRes, vincsRes] = await Promise.all([
      supabase
        .from('professionals')
        .select('id, nome, telefone, ativo, comissao_percentual, user_id')
        .eq('salon_id', salonId)
        .order('nome'),
      supabase
        .from('salon_invites')
        .select('id, nome, email, token, role, expira_em, usado_em')
        .eq('salon_id', salonId)
        .is('usado_em', null)
        .order('created_at', { ascending: false }),
      // O papel (dono/gerente/barbeiro) mora em user_salons — é o que as
      // políticas do banco consultam. Antes ficava numa tela separada
      // (/rede/equipe); desde 2026-08-25 a gestão é toda aqui.
      supabase.from('user_salons').select('id, user_id, role').eq('salon_id', salonId),
    ])
    // Falha de rede NÃO pode parecer "equipe vazia" — é a mentira que faz o
    // dono achar que perdeu os dados (já aconteceu com a sessão expirada).
    const falha = profsRes.error ?? convsRes.error ?? vincsRes.error
    if (falha) {
      console.error('Erro ao carregar a equipe:', falha)
      setErro('Não foi possível carregar a equipe. Confira a conexão e recarregue a página.')
      setLoading(false)
      return
    }
    setMembros((profsRes.data ?? []) as Membro[])
    setConvites((convsRes.data ?? []) as Convite[])
    setVinculos((vincsRes.data ?? []) as Vinculo[])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    carregar()
  }, [carregar])

  /**
   * Troca de papel, com as travas herdadas da antiga /rede/equipe: unidade sem
   * dono é bloqueada (porta sem volta), e rebaixar a si mesmo pede confirmação.
   */
  async function trocarPapel(v: Vinculo, novo: Papel) {
    if (novo === v.role) return

    if (v.role === 'owner' && novo !== 'owner') {
      const outrosDonos = vinculos.filter((x) => x.role === 'owner' && x.id !== v.id)
      if (outrosDonos.length === 0) {
        setErro('A barbearia ficaria sem dono. Promova outra pessoa a dono antes de mudar esta.')
        return
      }
    }

    if (v.user_id === user?.id) {
      const confirmado = window.confirm(
        'Você vai deixar de ser dono desta unidade e perderá o acesso de gestão dela. Continuar?',
      )
      if (!confirmado) return
    }

    setSalvandoMembro(v.id)
    setErro(null)
    // RPC, não update direto: desde a 0122 a escrita em `user_salons` saiu do
    // alcance do PostgREST. A trava de dono e a do último dono moram no banco
    // agora — as checagens acima viraram só o aviso amigável.
    const { error } = await supabase.rpc('definir_papel_do_membro', {
      p_vinculo_id: v.id,
      p_papel: novo,
    })
    setSalvandoMembro(null)
    if (error) {
      console.error('Erro ao trocar a função:', error)
      setErro(
        error.message?.includes('sem dono')
          ? 'A barbearia ficaria sem dono. Promova outra pessoa antes.'
          : error.message?.includes('Apenas o dono')
            ? 'Só o dono da barbearia pode mudar a função de alguém.'
            : 'Não foi possível alterar a função.',
      )
      return
    }
    // O próprio papel mudou: o contexto recarrega para o menu e as permissões
    // acompanharem sem novo login.
    if (v.user_id === user?.id) await recarregarUnidades()
    toast('Função alterada')
    carregar()
  }

  /**
   * Tirar da equipe = tirar o ACESSO.
   *
   * "Desativar" só some com o barbeiro da agenda; o vínculo em `user_salons`
   * continuava, e com ele o login, os agendamentos e a lista de clientes. O
   * dono achava que tinha demitido do sistema porque o botão dizia "Desativar".
   * A RPC apaga o vínculo, desativa o profissional (sem apagar histórico) e
   * recusa deixar a barbearia sem dono.
   */
  async function confirmarTirarDaEquipe() {
    if (!tirandoDaEquipe) return
    setSalvandoMembro(tirandoDaEquipe.vinculo)
    setErro(null)
    const { error } = await supabase.rpc('tirar_da_equipe', {
      p_vinculo_id: tirandoDaEquipe.vinculo,
    })
    setSalvandoMembro(null)
    setTirandoDaEquipe(null)
    if (error) {
      console.error('Erro ao tirar da equipe:', error)
      setErro(
        error.message?.includes('sem dono')
          ? 'A barbearia ficaria sem dono. Promova outra pessoa antes.'
          : error.message?.includes('Apenas o dono')
            ? 'Só o dono da barbearia pode tirar alguém da equipe.'
            : 'Não foi possível tirar da equipe.',
      )
      return
    }
    toast('Tirado da equipe — o acesso foi encerrado')
    carregar()
  }

  async function alternarAtivo(m: Membro) {
    // Trava de clique duplo: dois toques rápidos no power disparavam updates
    // concorrentes que se anulavam.
    if (salvandoMembro) return
    setSalvandoMembro(m.id)
    const { error } = await supabase.from('professionals').update({ ativo: !m.ativo }).eq('id', m.id)
    setSalvandoMembro(null)
    if (error) {
      setErro('Não foi possível alterar o status.')
      return
    }
    toast(m.ativo ? 'Barbeiro desativado' : 'Barbeiro reativado')
    carregar()
  }

  /**
   * A comissão só era definida no convite, então o dono criado pelo wizard
   * ficava sem percentual para sempre e renegociar com um barbeiro era
   * impossível pela tela. Pior: o financeiro trata `null` como 0 e mostra
   * comissão zerada sem avisar.
   */
  async function salvarComissao(m: Membro) {
    const texto = comissaoRascunho.trim().replace(',', '.')
    // Vazio = sem comissão (o dono que não tira percentual de si mesmo).
    const valor = texto === '' ? null : Number(texto)

    if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 100)) {
      setErro('A comissão deve ser um número entre 0 e 100.')
      return
    }

    setSalvandoMembro(m.id)
    setErro(null)
    const { error } = await supabase
      .from('professionals')
      .update({ comissao_percentual: valor })
      .eq('id', m.id)
    setSalvandoMembro(null)

    if (error) {
      console.error('Erro ao salvar comissão:', error)
      setErro('Não foi possível salvar a comissão.')
      return
    }
    setEditandoComissao(null)
    toast('Comissão salva')
    carregar()
  }

  /**
   * Achado 12: trocar o e-mail do convite era meia troca. O endereço mudava, o
   * link antigo continuava valendo, o prazo não era renovado e nada saía por
   * e-mail — o convidado ficava sem convite e o dono achava que tinha
   * resolvido.
   *
   * A RPC `trocar_email_do_convite` (migration 0128) faz as três coisas juntas:
   * gera token novo, dá 7 dias e zera `email_enviado_em`, que é o que devolve o
   * convite para a fila de e-mail do n8n. O `.from('salon_invites').update(...)`
   * que morava aqui não é nem opção: a 0128 revogou o UPDATE de `authenticated`,
   * então aquele caminho hoje volta 42501.
   *
   * `trocou = false` quer dizer mesmo endereço, ou seja, reenvio: o token
   * continua o mesmo e só o prazo e a fila são renovados.
   */
  async function trocarEmailDoConvite(c: Convite, email: string) {
    setSalvandoConvite(c.id)
    setErro(null)
    const { data, error } = await supabase.rpc('trocar_email_do_convite', {
      p_convite_id: c.id,
      p_email: email,
    })
    setSalvandoConvite(null)

    if (error) {
      console.error('Erro ao atualizar o convite:', error)
      // A RPC recusa com 42501 e 22023 trazendo frases em português já prontas
      // para o dono ler ("convite já aceito", "você não gerencia esta
      // barbearia"). Uma frase fixa aqui esconderia justamente o motivo.
      setErro(traduzirErroDoBanco(error, undefined, 'Não foi possível atualizar o convite.'))
      return
    }

    // A RPC é `returns table`, então a resposta chega como array de uma linha.
    const resultado = (Array.isArray(data) ? data[0] : data) as ResultadoDaTroca | undefined
    if (!resultado) {
      setErro('Não foi possível atualizar o convite.')
      return
    }

    // Token novo no state ANTES do `carregar()`: sem isso existe a janela em
    // que "Copiar link" copia o link que a RPC acabou de matar.
    setConvites((atuais) =>
      atuais.map((x) =>
        x.id === c.id
          ? { ...x, email, token: resultado.novo_token, expira_em: resultado.novo_prazo }
          : x,
      ),
    )

    const prazo = new Date(resultado.novo_prazo).toLocaleDateString('pt-BR')
    setAvisoDoConvite((atuais) => ({
      ...atuais,
      [c.id]: resultado.trocou
        ? `Convite refeito para ${email}. O link anterior parou de funcionar; o link novo sai por e-mail em alguns minutos e vale até ${prazo}. Se preferir não esperar, copie o link abaixo e mande você mesmo.`
        : `Convite reenviado para ${email}. O link continua o mesmo, o e-mail entrou na fila de novo e o prazo foi renovado até ${prazo}.`,
    }))

    // Só fecha o editor SE for o deste convite: "Reenviar" na linha de baixo
    // chega aqui pelo mesmo caminho, e fechar de qualquer jeito jogaria fora o
    // e-mail que o dono estava digitando em outra linha, sem avisar.
    setEditandoEmail((atual) => (atual === c.id ? null : atual))
    carregar()
  }

  async function salvarEmail(c: Convite) {
    const novo = emailRascunho.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(novo)) {
      setErro('E-mail inválido.')
      return
    }
    // Mesmo espírito do aviso de cancelar: trocar o endereço mata o link que já
    // foi enviado, e isso precisa ser dito antes, não descoberto depois pelo
    // convidado. Endereço igual é reenvio e não destrói nada — não pergunta.
    if (
      novo !== c.email &&
      !window.confirm(
        `Trocar o e-mail deste convite de ${c.email} para ${novo}?\n\n` +
          `O link já enviado para ${c.email} para de funcionar. Um link novo vai para ${novo}.`,
      )
    ) {
      return
    }
    await trocarEmailDoConvite(c, novo)
  }

  /**
   * "O convidado não recebeu" é o caso mais comum da vida real, e até aqui a
   * única saída era cancelar e refazer o convite. Reenviar é a mesma RPC com o
   * e-mail atual: mantém o link, renova o prazo e recoloca o convite na fila.
   */
  function reenviarConvite(c: Convite) {
    return trocarEmailDoConvite(c, c.email)
  }

  function fecharAviso(conviteId: string) {
    setAvisoDoConvite((atuais) => {
      const resto = { ...atuais }
      delete resto[conviteId]
      return resto
    })
  }

  async function cancelarConvite(c: Convite) {
    if (!window.confirm(`Cancelar o convite de ${nomeDoConvite(c)}? O link enviado deixa de funcionar.`))
      return

    setSalvandoConvite(c.id)
    setErro(null)
    const { error } = await supabase.from('salon_invites').delete().eq('id', c.id)
    setSalvandoConvite(null)

    if (error) {
      console.error('Erro ao cancelar o convite:', error)
      setErro('Não foi possível cancelar o convite.')
      return
    }
    carregar()
  }

  async function copiar(token: string) {
    await navigator.clipboard.writeText(linkDoConvite(token))
    setCopiado(token)
    setTimeout(() => setCopiado(null), 1500)
  }

  if (salonLoading) return <SkeletonPagina />

  // Dono de rede sem unidade escolhida: a equipe é por unidade.
  if (isOwner && !salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Escolha uma unidade no topo para gerenciar a equipe dela.
      </p>
    )
  }

  if (!isManager) {
    return (
      <p className="text-sm text-muted-foreground">
        Só o dono ou o gerente da barbearia tem acesso à gestão da equipe.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Equipe"
        subtitulo="Barbeiros que atendem nesta barbearia"
        acoes={
          <button
            onClick={() => setModalAberto(true)}
            className="flex items-center gap-2 btn-primary rounded-full px-5 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Convidar para a equipe
          </button>
        }
      />

      <ErroInline>{erro}</ErroInline>

      {/* Convites pendentes */}
      {convites.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">Convites aguardando</h2>
          <div className="divide-y divide-border">
            {convites.map((c) => {
              const nome = nomeDoConvite(c)
              const prazo = new Date(c.expira_em)
              // A lista não filtra por prazo, e é de propósito: sumir com o
              // convite vencido deixaria o dono esperando uma resposta que não
              // vem mais. Então o vencido tem que se identificar como vencido e
              // dizer como voltar a valer.
              const vencido = prazo.getTime() < Date.now()
              const aviso = avisoDoConvite[c.id]
              return (
                <div key={c.id} className="py-2 first:pt-0 last:pb-0">
                  {editandoEmail === c.id ? (
                    // O erro de "e-mail já cadastrado" só aparece quando o
                    // convidado abre o link, então o dono precisa poder corrigir
                    // o endereço depois de o convite já existir.
                    <div className="space-y-2">
                      <div className="text-sm text-foreground">{nome}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="email"
                          value={emailRascunho}
                          onChange={(e) => setEmailRascunho(e.target.value)}
                          aria-label={`Novo e-mail do convite de ${nome}`}
                          className="flex-1 min-w-[12rem]"
                        />
                        <button
                          onClick={() => salvarEmail(c)}
                          disabled={salvandoConvite === c.id}
                          className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        >
                          {salvandoConvite === c.id ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                          onClick={() => setEditandoEmail(null)}
                          className="text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-foreground">{nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.email} ·{' '}
                          {vencido ? (
                            <span className="inline-flex items-center gap-1 font-medium text-warning">
                              <AlertTriangle size={12} />
                              venceu em{' '}
                              {prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            </span>
                          ) : (
                            <>expira em {prazo.toLocaleDateString('pt-BR')}</>
                          )}
                        </div>
                        {vencido && (
                          <div className="mt-0.5 text-xs text-warning">
                            Este link não abre mais. <strong>Reenviar</strong> renova o prazo por mais
                            7 dias e manda o convite outra vez.
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => copiar(c.token)}
                          className="btn-chip btn-chip-primario flex items-center gap-1.5"
                        >
                          {copiado === c.token ? <Check size={14} /> : <Copy size={14} />}
                          {copiado === c.token ? 'Link copiado!' : 'Copiar link'}
                        </button>
                        <button
                          onClick={() => reenviarConvite(c)}
                          disabled={salvandoConvite === c.id}
                          className="btn-chip flex items-center gap-1"
                        >
                          <Send size={12} />
                          {salvandoConvite === c.id ? 'Enviando...' : 'Reenviar'}
                        </button>
                        <button
                          onClick={() => {
                            setEditandoEmail(c.id)
                            setEmailRascunho(c.email)
                            setErro(null)
                          }}
                          className="btn-chip flex items-center gap-1"
                        >
                          <Pencil size={12} />
                          Trocar e-mail
                        </button>
                        <button
                          onClick={() => cancelarConvite(c)}
                          disabled={salvandoConvite === c.id}
                          className="btn-chip btn-chip-perigo flex items-center gap-1"
                        >
                          <Trash2 size={12} />
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {aviso && (
                    <div className="mt-2 space-y-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2">
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-xs text-foreground">{aviso}</p>
                        <button
                          onClick={() => fecharAviso(c.id)}
                          aria-label="Fechar aviso"
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {/* O botão de copiar repetido aqui não é enfeite: quando o
                          e-mail demora, o dono manda o link pelo WhatsApp, e ter
                          que caçar o botão em outra linha é o atrito que faz ele
                          desistir e refazer o convite do zero. */}
                      <button
                        onClick={() => copiar(c.token)}
                        className="btn-chip btn-chip-primario flex items-center gap-1.5"
                      >
                        {copiado === c.token ? <Check size={14} /> : <Copy size={14} />}
                        {copiado === c.token ? 'Link copiado!' : 'Copiar link'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Equipe */}
      <div className="bg-surface border border-border rounded-2xl shadow-sm divide-y divide-border">
        {loading && (
          <div className="p-4">
            <SkeletonLinhas />
          </div>
        )}

        {membros.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-soft text-primary-soft-foreground font-semibold text-sm shrink-0">
                {m.nome.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {m.nome}
                  {!m.ativo && (
                    <span className="ml-2 inline-flex align-middle">
                      <Badge variante="neutro">Inativo</Badge>
                    </span>
                  )}
                  {!m.user_id && (
                    <span className="ml-2 inline-flex align-middle">
                      <Badge variante="atencao">Sem acesso</Badge>
                    </span>
                  )}
                </div>
                {editandoComissao === m.id ? (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-28">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        autoFocus
                        value={comissaoRascunho}
                        onChange={(e) => setComissaoRascunho(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') salvarComissao(m)
                          if (e.key === 'Escape') setEditandoComissao(null)
                        }}
                        placeholder="sem comissão"
                        aria-label={`Comissão de ${m.nome} em porcentagem`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">%</span>
                    <button
                      onClick={() => salvarComissao(m)}
                      disabled={salvandoMembro === m.id}
                      aria-label="Salvar comissão"
                      className="p-1 rounded-md text-success hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditandoComissao(null)}
                      aria-label="Cancelar"
                      className="p-1 rounded-md text-muted-foreground hover:bg-surface-2"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {(() => {
                      const vinculo = m.user_id ? vinculos.find((v) => v.user_id === m.user_id) : null
                      const partes = [
                        vinculo ? LABEL_PAPEL[vinculo.role] : null,
                        m.comissao_percentual
                          ? `Comissão ${Number(m.comissao_percentual).toFixed(0)}%`
                          : 'Sem comissão definida',
                      ].filter(Boolean)
                      return (
                        <>
                          {partes.join(' · ')}
                          {m.telefone && linkWhatsApp(m.telefone) && (
                            <>
                              {' · '}
                              <a
                                href={linkWhatsApp(m.telefone)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {formatarTelefone(m.telefone)}
                              </a>
                            </>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {(() => {
                const vinculo = m.user_id ? vinculos.find((v) => v.user_id === m.user_id) : null
                // Só o dono promove e rebaixa — gerente vê a função como texto.
                if (!isOwner || !vinculo) return null
                return (
                  <select
                    value={vinculo.role}
                    disabled={salvandoMembro === vinculo.id}
                    onChange={(e) => trocarPapel(vinculo, e.target.value as Papel)}
                    aria-label={`Função de ${m.nome}`}
                    className="border border-border-strong bg-surface text-foreground rounded-lg px-2 py-1 text-xs disabled:opacity-50"
                  >
                    <option value="barbeiro">Barbeiro</option>
                    <option value="gerente">Gerente</option>
                    <option value="owner">Dono</option>
                  </select>
                )
              })()}
              {/* Rótulo embaixo de cada ícone: o `title` (tooltip) não existe
                  no celular, e %/relógio/power eram hieróglifos para quem
                  entra no sistema pela primeira vez. */}
              <button
                onClick={() => {
                  setEditandoComissao(m.id)
                  setComissaoRascunho(m.comissao_percentual != null ? String(Number(m.comissao_percentual)) : '')
                }}
                aria-label={`Comissão de ${m.nome}`}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Percent size={16} />
                <span className="text-[10px] leading-none">Comissão</span>
              </button>
              <button
                onClick={() => setHorarioDe(m)}
                aria-label={`Horário de ${m.nome}`}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Clock size={16} />
                <span className="text-[10px] leading-none">Horário</span>
              </button>
              <button
                onClick={() => alternarAtivo(m)}
                aria-label={m.ativo ? `Desativar ${m.nome}` : `Reativar ${m.nome}`}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md hover:bg-surface-2 ${
                  m.ativo ? 'text-muted-foreground hover:text-danger' : 'text-success'
                }`}
              >
                <Power size={16} />
                <span className="text-[10px] leading-none">{m.ativo ? 'Desativar' : 'Ativar'}</span>
              </button>
              {/* Desativar tira da agenda; TIRAR DA EQUIPE tira o acesso. Eram a
                  mesma coisa na cabeça do dono e não eram no sistema: o
                  desativado continuava entrando e lendo clientes. */}
              {m.user_id && vinculos.some((v) => v.user_id === m.user_id) && (
                <button
                  onClick={() =>
                    setTirandoDaEquipe({
                      vinculo: vinculos.find((v) => v.user_id === m.user_id)!.id,
                      nome: m.nome,
                    })
                  }
                  aria-label={`Tirar ${m.nome} da equipe`}
                  className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-surface-2"
                >
                  <UserMinus size={16} />
                  <span className="text-[10px] leading-none">Tirar</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {!loading && membros.length === 0 && (
          <EstadoVazio icone={Users} titulo="Nenhum barbeiro cadastrado ainda." />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        O barbeiro vê apenas os agendamentos dele, os clientes que atendeu e a própria comissão.
        Faturamento da barbearia, WhatsApp e catálogo ficam só com você.
      </p>

      {horarioDe && (
        <HorarioBarbeiroModal
          professionalId={horarioDe.id}
          nome={horarioDe.nome}
          onClose={() => setHorarioDe(null)}
        />
      )}

      {modalAberto && salonId && (
        <ConviteModal
          salonId={salonId}
          onClose={() => setModalAberto(false)}
          onCriado={carregar}
        />
      )}

      {tirandoDaEquipe && (
        <Modal onClose={() => setTirandoDaEquipe(null)} titulo="Tirar da equipe" tamanho="sm">
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              <strong>{tirandoDaEquipe.nome}</strong> perde o acesso ao sistema agora: não entra
              mais, não vê a agenda nem os clientes da barbearia.
            </p>
            <p className="text-sm text-muted-foreground">
              O histórico de atendimentos e comissões fica guardado, e ele sai da agenda. Para
              voltar, precisa de um convite novo.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmarTirarDaEquipe}
                disabled={salvandoMembro === tirandoDaEquipe.vinculo}
                className="flex-1 btn-danger rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {salvandoMembro === tirandoDaEquipe.vinculo ? 'Tirando...' : 'Tirar da equipe'}
              </button>
              <button
                onClick={() => setTirandoDaEquipe(null)}
                className="flex-1 btn-secondary rounded-lg px-3 py-2.5 text-sm font-medium"
              >
                Manter
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ConviteModal({
  salonId,
  onClose,
  onCriado,
}: {
  salonId: string
  onClose: () => void
  onCriado: () => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [comissao, setComissao] = useState('50')
  const [papel, setPapel] = useState<'barbeiro' | 'gerente'>('barbeiro')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha nome e e-mail.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('E-mail inválido.')
      return
    }

    setSalvando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('salon_invites')
      .insert({
        salon_id: salonId,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        role: papel,
        comissao_percentual: comissao ? Number(comissao) : null,
      })
      .select('token')
      .single()
    setSalvando(false)

    if (error || !data) {
      console.error('Erro ao criar convite:', error)
      setErro('Não foi possível gerar o convite. Tente novamente.')
      return
    }

    setLink(linkDoConvite(data.token))
    onCriado()
  }

  return (
    <Modal
      onClose={onClose}
      titulo={
        <span className="flex items-center gap-2">
          <UserPlus size={18} />
          Convidar para a equipe
        </span>
      }
      tamanho="sm"
    >
        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">Convite criado! Mande este link para a pessoa convidada:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-xs break-all">{link}</code>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(link)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 1500)
                }}
                aria-label="Copiar link"
                className="p-2 border border-border-strong rounded-md text-muted-foreground hover:bg-surface-2 shrink-0"
              >
                {copiado ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              O link vale por 7 dias e só pode ser usado uma vez. Ele vai criar a própria senha —
              e também enviamos o convite por e-mail em alguns minutos, então mandar o link é
              opcional.
            </p>
            <button onClick={onClose} className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium">
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={criar} className="space-y-3">
            <Campo rotulo="Nome" htmlFor="convite-nome">
              <Input id="convite-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo rotulo="E-mail de acesso" htmlFor="convite-email">
              <Input
                id="convite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Função"
              htmlFor="convite-papel"
              apoio={
                papel === 'gerente'
                  ? 'Enxerga e edita tudo desta barbearia, menos o painel da rede.'
                  : 'Vê apenas os próprios agendamentos, clientes atendidos e comissão.'
              }
            >
              <Select
                id="convite-papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as 'barbeiro' | 'gerente')}
              >
                <option value="barbeiro">Barbeiro — vê só o que é dele</option>
                <option value="gerente">Gerente — administra esta unidade</option>
              </Select>
            </Campo>

            <Campo rotulo="Comissão (%)" htmlFor="convite-comissao">
              <Input
                id="convite-comissao"
                type="number"
                min={0}
                max={100}
                value={comissao}
                onChange={(e) => setComissao(e.target.value)}
              />
            </Campo>

            <ErroInline>{erro}</ErroInline>

            <button
              type="submit"
              disabled={salvando}
              className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Link2 size={16} />
              {salvando ? 'Gerando...' : 'Gerar link de convite'}
            </button>
          </form>
        )}
    </Modal>
  )
}
