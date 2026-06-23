import { create } from 'zustand'

export const useStore = create((set, get) => ({
  user: null,
  workspace: null,
  miembro: null,
  miembros: [],
  modo: 'solo',
  notificacionesNoLeidas: 0,

  setUser: (user) => set({ user }),
  setWorkspace: (workspace) => set({ workspace }),
  setMiembro: (miembro) => set({ miembro }),
  setMiembros: (miembros) => {
    const activos = miembros.filter(m => m.activo !== false).length
    const modo = activos <= 1 ? 'solo' : activos <= 5 ? 'equipo_pequeno' : 'equipo'
    set({ miembros, modo })
  },
  setModo: (modo) => set({ modo }),
  setNotifCount: (n) => set({ notificacionesNoLeidas: n }),

  // Helpers
  getModo: () => {
    const { miembros } = get()
    const activos = miembros.filter(m => m.activo !== false).length
    return activos <= 1 ? 'solo' : activos <= 5 ? 'equipo_pequeno' : 'equipo'
  },

  isOwner: () => {
    const { miembro } = get()
    return miembro?.boss_rol === 'owner'
  },

  isAdmin: () => {
    const { miembro } = get()
    return miembro?.boss_rol === 'owner' || miembro?.boss_rol === 'admin'
  },

  reset: () => set({
    user: null,
    workspace: null,
    miembro: null,
    miembros: [],
    modo: 'solo',
    notificacionesNoLeidas: 0
  })
}))
