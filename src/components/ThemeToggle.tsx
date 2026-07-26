import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { getStoredTheme, getPreferredTheme, setTheme, type Theme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? getPreferredTheme())

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      className="relative inline-flex items-center w-14 h-8 rounded-full bg-surface-2 border border-border transition-colors shrink-0"
    >
      <span
        className={`absolute top-1 left-1 flex items-center justify-center w-6 h-6 rounded-full bg-surface shadow-sm transition-transform ${
          theme === 'dark' ? 'translate-x-6' : 'translate-x-0'
        }`}
      >
        {theme === 'dark' ? (
          <Moon size={14} className="text-primary" />
        ) : (
          <Sun size={14} className="text-warning" />
        )}
      </span>
    </button>
  )
}
