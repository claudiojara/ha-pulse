import type { Area } from '@dashboard-web/shared';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

type AreaId = Area['area_id'];

interface AreasState {
  areas: Record<AreaId, Area>;
  loaded: boolean;

  setInitialAreas: (areas: Area[]) => void;
  setAreas: (areas: Area[]) => void;
}

export const useAreasStore = create<AreasState>((set) => ({
  areas: {},
  loaded: false,

  setInitialAreas: (areas) =>
    set(() => ({ areas: indexById(areas), loaded: true })),

  setAreas: (areas) => set(() => ({ areas: indexById(areas), loaded: true })),
}));

function indexById(areas: Area[]): Record<AreaId, Area> {
  const map: Record<AreaId, Area> = {};
  for (const a of areas) map[a.area_id] = a;
  return map;
}

export function useAreasList(): Area[] {
  return useAreasStore(
    useShallow((s) =>
      Object.values(s.areas).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    ),
  );
}

export function useArea(areaId: AreaId | undefined): Area | undefined {
  return useAreasStore((s) => (areaId ? s.areas[areaId] : undefined));
}
