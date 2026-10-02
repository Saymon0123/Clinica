import type { ReactNode } from 'react'

/**
 * O botão de ação da linha da Equipe: ícone em cima, rótulo de 10px embaixo.
 *
 * Existe como componente porque o dialeto estava escrito **cinco vezes** na
 * `EquipePage` -- comissão, serviços, horário, ativar/desativar e tirar da
 * equipe --, e foi o sexto que estourou o teto de botões sem classe do sistema
 * (`botoesDoSistema.test.ts`). A saída que a casa já usou em 21/09, quando o
 * seletor de período fez a mesma coisa, é esta: extrair, para o dialeto
 * aparecer uma vez só e o teto da tela descer.
 *
 * O rótulo embaixo do ícone não é enfeite: `title` não existe no celular, e
 * %/relógio/tesoura/power eram hieróglifos para quem entra no sistema pela
 * primeira vez.
 *
 * `tom` é cor de REPOUSO, nunca de hover (regra D3): no celular hover não
 * existe, e "Desativar" ficava idêntico a "Comissão" até o dedo tocar.
 */
export function AcaoDaLinha({
  aria,
  rotulo,
  tom = 'neutro',
  onClick,
  children,
}: {
  aria: string
  rotulo: string
  tom?: 'neutro' | 'danger' | 'success'
  onClick: () => void
  /** O ícone. Vem como filho para quem precisa enfeitar -- o de serviços
   *  carrega um ponto quando ninguém escolheu a lista do barbeiro ainda. */
  children: ReactNode
}) {
  const cor =
    tom === 'danger'
      ? 'text-danger'
      : tom === 'success'
        ? 'text-success'
        : 'text-muted-foreground hover:text-foreground'

  return (
    <button
      onClick={onClick}
      aria-label={aria}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md hover:bg-surface-2 ${cor}`}
    >
      {children}
      <span className="text-[10px] leading-none">{rotulo}</span>
    </button>
  )
}
