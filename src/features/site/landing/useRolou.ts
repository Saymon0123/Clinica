import { useEffect, useState } from 'react'

/**
 * Diz se a página já passou de um limiar de scroll.
 *
 * Guarda só um booleano, e não a posição. O que a barra de navegação precisa
 * saber é de que lado do limiar ela está; guardar o valor contínuo faria o
 * componente renderizar dezenas de vezes por segundo para trocar a mesma classe.
 *
 * O listener é `passive`: sem isso o navegador precisa esperar o handler para
 * saber se ele vai cancelar o scroll, e o gesto engasga no celular.
 */
export function useRolou(limiar = 80) {
  const [rolou, setRolou] = useState(false)

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > limiar)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [limiar])

  return rolou
}
