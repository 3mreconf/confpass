import { create } from 'zustand';
import type { PasswordEntry } from '../types';

interface VaultStore {
  entries: PasswordEntry[];
  vaultLocked: boolean;
  favorites: Set<string>;
  setEntries: (entries: PasswordEntry[]) => void;
  addEntry: (entry: PasswordEntry) => void;
  updateEntry: (id: string, entry: Partial<PasswordEntry>) => void;
  deleteEntry: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setVaultLocked: (locked: boolean) => void;
  clearEntries: () => void;
}

export const useVaultStore = create<VaultStore>((set) => ({
  entries: [],
  vaultLocked: true,
  favorites: new Set(),
  
  setEntries: (entries) => set({ entries }),
  
  addEntry: (entry) => set((state) => ({ 
    entries: [...state.entries, entry] 
  })),
  
  updateEntry: (id, updatedEntry) => set((state) => ({
    entries: state.entries.map(entry =>
      entry.id === id ? { ...entry, ...updatedEntry } : entry
    )
  })),
  
  deleteEntry: (id) => set((state) => ({
    entries: state.entries.filter(entry => entry.id !== id),
    favorites: new Set([...state.favorites].filter(favId => favId !== id))
  })),
  
  toggleFavorite: (id) => set((state) => {
    const newFavorites = new Set(state.favorites);
    if (newFavorites.has(id)) {
      newFavorites.delete(id);
    } else {
      newFavorites.add(id);
    }
    return { favorites: newFavorites };
  }),
  
  setVaultLocked: (locked) => set({ vaultLocked: locked }),
  
  clearEntries: () => set({ entries: [], favorites: new Set() })
}));
