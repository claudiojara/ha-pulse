import type {
  EntityId,
  EntityOverride,
  PreferencesSnapshot,
} from '@dashboard-web/shared';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

interface PreferencesState {
  loaded: boolean;
  hidden: Set<EntityId>;
  overrides: Record<EntityId, EntityOverride>;
  layouts: Record<string, EntityId[]>;
  prefs: Record<string, string>;

  /** Modo edición global (no persistido en DB; viaja por localStorage). */
  editMode: boolean;
  setEditMode: (v: boolean) => void;

  applySnapshot: (snap: PreferencesSnapshot) => void;
}

const EDIT_MODE_KEY = 'dashboard.editMode';

function loadEditMode(): boolean {
  try {
    return localStorage.getItem(EDIT_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveEditMode(v: boolean): void {
  try {
    if (v) localStorage.setItem(EDIT_MODE_KEY, '1');
    else localStorage.removeItem(EDIT_MODE_KEY);
  } catch {
    // localStorage no disponible (modo incógnito viejo, etc) — silencioso.
  }
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  loaded: false,
  hidden: new Set(),
  overrides: {},
  layouts: {},
  prefs: {},

  editMode: typeof window !== 'undefined' ? loadEditMode() : false,
  setEditMode: (v) => {
    saveEditMode(v);
    set({ editMode: v });
  },

  applySnapshot: (snap) =>
    set(() => ({
      loaded: true,
      hidden: new Set(snap.hidden_entities),
      overrides: { ...snap.entity_overrides },
      layouts: { ...snap.room_layouts },
      prefs: { ...snap.user_prefs },
    })),
}));

/** Selectors estables (useShallow) para evitar loops de re-render. */

export function useIsHidden(entityId: EntityId): boolean {
  return usePreferencesStore((s) => s.hidden.has(entityId));
}

export function useOverride(entityId: EntityId): EntityOverride | undefined {
  return usePreferencesStore((s) => s.overrides[entityId]);
}

export function useRoomLayout(areaId: string | undefined): EntityId[] | undefined {
  return usePreferencesStore(
    useShallow((s) => (areaId ? s.layouts[areaId] : undefined)),
  );
}

export function usePref(key: string): string | undefined {
  return usePreferencesStore((s) => s.prefs[key]);
}

export function useEditMode(): boolean {
  return usePreferencesStore((s) => s.editMode);
}
