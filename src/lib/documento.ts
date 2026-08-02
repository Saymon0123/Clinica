/**
 * Validação de CPF e CNPJ.
 *
 * O Asaas recusa a criação do cliente quando o documento é inválido, e o erro
 * dele chega genérico. Validar antes evita que o dono clique em "Assinar", veja
 * uma mensagem incompreensível e conclua que o sistema está quebrado — quando
 * na verdade ele digitou um dígito errado.
 *
 * Guardamos e enviamos **só os dígitos**: o Asaas aceita assim, e comparar
 * documento com pontuação é a mesma armadilha do telefone.
 */

export function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, '')
}

function digitoVerificador(base: string, pesoInicial: number) {
  let soma = 0
  let peso = pesoInicial
  for (const c of base) {
    soma += Number(c) * peso
    peso--
    // CNPJ usa pesos que voltam a 9 depois do 2.
    if (peso < 2) peso = 9
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

function cpfValido(d: string) {
  if (d.length !== 11) return false
  // Todos os dígitos iguais passam na conta dos verificadores, mas não existem.
  if (/^(\d)\1{10}$/.test(d)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== Number(d[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  return resto === Number(d[10])
}

function cnpjValido(d: string) {
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false
  if (digitoVerificador(d.slice(0, 12), 5) !== Number(d[12])) return false
  return digitoVerificador(d.slice(0, 13), 6) === Number(d[13])
}

/** `null` quando está tudo certo; a mensagem para a tela quando não está. */
export function problemaNoDocumento(valor: string): string | null {
  const d = apenasDigitos(valor)

  if (d.length === 0) return 'Informe o CPF ou CNPJ.'
  if (d.length !== 11 && d.length !== 14) {
    return 'CPF tem 11 dígitos e CNPJ tem 14. Confira o que foi digitado.'
  }
  if (d.length === 11 && !cpfValido(d)) return 'Esse CPF não é válido.'
  if (d.length === 14 && !cnpjValido(d)) return 'Esse CNPJ não é válido.'

  return null
}

/** Formata para leitura: 000.000.000-00 ou 00.000.000/0000-00. */
export function formatarDocumento(valor: string) {
  const d = apenasDigitos(valor).slice(0, 14)

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}
