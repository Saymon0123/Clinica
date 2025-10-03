import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  email: string
  full_name: string
  birth_date: string
  specialty?: string
  role: 'ADM' | 'FUNCIONARIO'
  created_at: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  logout: () => void
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      
      setUser: (user) => set({ user }),
      
      setToken: (token) => {
        set({ token })
        if (token) {
          localStorage.setItem('token', token)
        } else {
          localStorage.removeItem('token')
        }
      },
      
      logout: () => {
        set({ user: null, token: null })
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      },
      
      isAdmin: () => {
        const { user } = get()
        return user?.role === 'ADM'
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
)
