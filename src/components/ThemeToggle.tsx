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
      className="relative inline-flex items-center w-14 h-8 rounded-full bg-gray-200 dark:bg-gray-700 transition-colors shrink-0"
    >
      <span
        className={`absolute top-1 left-1 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-gray-900 shadow transition-transform ${
          theme === 'dark' ? 'translate-x-6' : 'translate-x-0'
        }`}
      >
        {theme === 'dark' ? (
          <Moon size={14} className="text-gray-100" />
        ) : (
          <Sun size={14} className="text-amber-500" />
        )}
      </span>
    </button>
  )
}
