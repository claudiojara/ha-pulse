import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useEntitiesStore } from '@/stores/entities';

/**
 * Bootstrap del socket. Suscribe a initial_states + state_changed + connection_status
 * y escribe al store global. Llamar UNA vez en el root de la app.
 */
export function useHaSocket(): void {
  const setInitial = useEntitiesStore((s) => s.setInitialStates);
  const apply = useEntitiesStore((s) => s.applyStateChanged);
  const setConnection = useEntitiesStore((s) => s.setConnection);

  useEffect(() => {
    const socket = getSocket();

    const onInitial = (states: Parameters<typeof setInitial>[0]): void => {
      setInitial(states);
    };
    const onStateChanged: Parameters<typeof socket.on<'state_changed'>>[1] = (event) => {
      apply(event.entity_id, event.new_state);
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
    socket.on('connection_status', onStatus);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('initial_states', onInitial);
      socket.off('state_changed', onStateChanged);
      socket.off('connection_status', onStatus);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [setInitial, apply, setConnection]);
}
