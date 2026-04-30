import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useAreasStore } from '@/stores/areas';
import { useEntitiesStore } from '@/stores/entities';
import { usePreferencesStore } from '@/stores/preferences';

/**
 * Bootstrap del socket. Suscribe a initial_states + state_changed + initial_areas +
 * areas_updated + connection_status y escribe a los stores globales. Llamar UNA vez
 * en el root de la app.
 */
export function useHaSocket(): void {
  const setInitial = useEntitiesStore((s) => s.setInitialStates);
  const apply = useEntitiesStore((s) => s.applyStateChanged);
  const setEntityAreaMap = useEntitiesStore((s) => s.setEntityAreaMap);
  const setConnection = useEntitiesStore((s) => s.setConnection);
  const setInitialAreas = useAreasStore((s) => s.setInitialAreas);
  const setAreas = useAreasStore((s) => s.setAreas);
  const applyPreferences = usePreferencesStore((s) => s.applySnapshot);

  useEffect(() => {
    const socket = getSocket();

    const onInitial = (states: Parameters<typeof setInitial>[0]): void => {
      setInitial(states);
    };
    const onStateChanged: Parameters<typeof socket.on<'state_changed'>>[1] = (event) => {
      apply(event.entity_id, event.new_state);
    };
    const onInitialAreas: Parameters<typeof socket.on<'initial_areas'>>[1] = (areas) => {
      setInitialAreas(areas);
    };
    const onAreasUpdated: Parameters<typeof socket.on<'areas_updated'>>[1] = (areas) => {
      setAreas(areas);
    };
    const onInitialEntityAreas: Parameters<typeof socket.on<'initial_entity_areas'>>[1] = (
      map,
    ) => {
      setEntityAreaMap(map);
    };
    const onEntityAreasUpdated: Parameters<typeof socket.on<'entity_areas_updated'>>[1] = (
      map,
    ) => {
      setEntityAreaMap(map);
    };
    const onInitialPreferences: Parameters<typeof socket.on<'initial_preferences'>>[1] = (
      prefs,
    ) => {
      applyPreferences(prefs);
    };
    const onPreferencesUpdated: Parameters<typeof socket.on<'preferences_updated'>>[1] = (
      prefs,
    ) => {
      applyPreferences(prefs);
    };
    const onStatus: Parameters<typeof socket.on<'connection_status'>>[1] = (status) => {
      setConnection(status);
    };
    const onConnect = (): void => {
      setConnection({
        connected: true,
        haReachable: true,
        lastSync: new Date().toISOString(),
      });
    };
    const onDisconnect = (): void => {
      setConnection({ connected: false, haReachable: false, lastSync: null });
    };

    socket.on('initial_states', onInitial);
    socket.on('state_changed', onStateChanged);
    socket.on('initial_areas', onInitialAreas);
    socket.on('areas_updated', onAreasUpdated);
    socket.on('initial_entity_areas', onInitialEntityAreas);
    socket.on('entity_areas_updated', onEntityAreasUpdated);
    socket.on('initial_preferences', onInitialPreferences);
    socket.on('preferences_updated', onPreferencesUpdated);
    socket.on('connection_status', onStatus);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('initial_states', onInitial);
      socket.off('state_changed', onStateChanged);
      socket.off('initial_areas', onInitialAreas);
      socket.off('areas_updated', onAreasUpdated);
      socket.off('initial_entity_areas', onInitialEntityAreas);
      socket.off('entity_areas_updated', onEntityAreasUpdated);
      socket.off('initial_preferences', onInitialPreferences);
      socket.off('preferences_updated', onPreferencesUpdated);
      socket.off('connection_status', onStatus);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [
    setInitial,
    apply,
    setEntityAreaMap,
    setConnection,
    setInitialAreas,
    setAreas,
    applyPreferences,
  ]);
}
