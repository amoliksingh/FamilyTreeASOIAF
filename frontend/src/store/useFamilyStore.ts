import { create } from "zustand";
import type { PersonMap, PersonSummary, ConnectionResponse } from "../types/person";
import { fetchAllPersons, searchPersons, fetchConnection } from "../api/familyTreeApi";

interface FamilyStore {
  allPersons: PersonMap;
  centerId: string | null;
  history: string[];
  highlightedId: string | null;
  searchQuery: string;
  searchResults: PersonSummary[];
  isLoading: boolean;
  error: string | null;

  connectionMode: boolean;
  connectionFrom: PersonSummary | null;
  connectionTo: PersonSummary | null;
  connectionResult: ConnectionResponse | null;
  connectionLoading: boolean;

  loadAllPersons: () => Promise<void>;
  setCenterId: (id: string) => void;
  goBack: () => void;
  setHighlightedId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  search: (q: string) => Promise<void>;
  clearSearch: () => void;

  toggleConnectionMode: () => void;
  setConnectionFrom: (p: PersonSummary | null) => void;
  setConnectionTo: (p: PersonSummary | null) => void;
  findConnection: () => Promise<void>;
  clearConnection: () => void;
}

export const useFamilyStore = create<FamilyStore>((set, get) => ({
  allPersons: {},
  centerId: null,
  history: [],
  highlightedId: null,
  searchQuery: "",
  searchResults: [],
  isLoading: false,
  error: null,

  connectionMode: false,
  connectionFrom: null,
  connectionTo: null,
  connectionResult: null,
  connectionLoading: false,

  loadAllPersons: async () => {
    set({ isLoading: true, error: null });
    try {
      const allPersons = await fetchAllPersons();
      // Default to first person alphabetically if no center set
      const defaultId = "I0041";
      set({ allPersons, isLoading: false, centerId: get().centerId ?? defaultId });
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  setCenterId: (id) => {
    const { centerId, history } = get();
    set({
      centerId: id,
      history: centerId ? [...history, centerId] : history,
      highlightedId: null,
      searchQuery: "",
      searchResults: [],
    });
  },

  goBack: () => {
    const { history } = get();
    if (!history.length) return;
    set({
      centerId: history[history.length - 1],
      history: history.slice(0, -1),
      highlightedId: null,
      searchQuery: "",
      searchResults: [],
    });
  },

  setHighlightedId: (id) => set({ highlightedId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  search: async (q) => {
    set({ searchQuery: q });
    if (!q.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const results = await searchPersons(q);
      set({ searchResults: results });
    } catch {
      set({ searchResults: [] });
    }
  },

  clearSearch: () => set({ searchQuery: "", searchResults: [] }),

  toggleConnectionMode: () => set((s) => ({ connectionMode: !s.connectionMode })),

  setConnectionFrom: (p) => set({ connectionFrom: p, connectionResult: null }),

  setConnectionTo: (p) => set({ connectionTo: p, connectionResult: null }),

  findConnection: async () => {
    const { connectionFrom, connectionTo } = get();
    if (!connectionFrom || !connectionTo) return;
    set({ connectionLoading: true, connectionResult: null });
    try {
      const result = await fetchConnection(connectionFrom.id, connectionTo.id);
      set({ connectionResult: result });
    } catch {
      set({ connectionResult: { found: false, paths: [] } });
    } finally {
      set({ connectionLoading: false });
    }
  },

  clearConnection: () => set({
    connectionFrom: null,
    connectionTo: null,
    connectionResult: null,
    connectionLoading: false,
  }),
}));
