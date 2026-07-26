export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'crm_theme'

export function getStoredTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

export function getPreferredTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}

export function initTheme(): Theme {
  const theme = getStoredTheme() ?? getPreferredTheme()
  applyTheme(theme)
  return theme
}
