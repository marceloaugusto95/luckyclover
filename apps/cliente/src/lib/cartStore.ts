import { create } from 'zustand';

export interface CartItem {
    id: string; // Temporary ID for UI
    game: string; // 'mega-sena'
    numbers: number[];
    amount: number;
    concurso: number;
    // Client info is global usually, but we keep it structured
}

interface CartState {
    items: CartItem[];
    isOpen: boolean;
    addItem: (item: Omit<CartItem, 'id'>) => void;
    removeItem: (id: string) => void;
    clearCart: () => void;
    toggleCart: () => void;
    total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
    items: [],
    isOpen: false,
    addItem: (item) => set((state) => ({
        items: [...state.items, { ...item, id: crypto.randomUUID() }],
        isOpen: true
    })),
    removeItem: (id) => set((state) => ({
        items: state.items.filter((i) => i.id !== id)
    })),
    clearCart: () => set({ items: [] }),
    toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
    total: () => get().items.reduce((sum, item) => sum + item.amount, 0)
}));
