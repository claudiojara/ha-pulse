import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useAreasStore } from '@/stores/areas';
import { useChatStore } from '@/stores/chat';
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
  const chat = useChatStore.getState; // acceso fresco al store en cada handler

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

    const onChatTextStart = () => chat().startText();
    const onChatTextDelta = (delta: string) => chat().appendText(delta);
    const onChatThinkingStart = () => chat().startThinking();
    const onChatThinkingDelta = (delta: string) => chat().appendThinking(delta);
    const onChatToolUseStart: Parameters<typeof socket.on<'chat_tool_use_start'>>[1] = (
      e,
    ) => chat().startToolUse(e);
    const onChatToolUse: Parameters<typeof socket.on<'chat_tool_use'>>[1] = (e) =>
      chat().finalizeToolUse(e);
    const onChatToolResult: Parameters<typeof socket.on<'chat_tool_result'>>[1] = (e) =>
      chat().setToolResult(e);
    const onChatDone: Parameters<typeof socket.on<'chat_done'>>[1] = (e) => chat().done(e);
    const onChatError: Parameters<typeof socket.on<'chat_error'>>[1] = (m) =>
      chat().error(m);

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
    socket.on('chat_text_start', onChatTextStart);
    socket.on('chat_text_delta', onChatTextDelta);
    socket.on('chat_thinking_start', onChatThinkingStart);
    socket.on('chat_thinking_delta', onChatThinkingDelta);
    socket.on('chat_tool_use_start', onChatToolUseStart);
    socket.on('chat_tool_use', onChatToolUse);
    socket.on('chat_tool_result', onChatToolResult);
    socket.on('chat_done', onChatDone);
    socket.on('chat_error', onChatError);

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
      socket.off('chat_text_start', onChatTextStart);
      socket.off('chat_text_delta', onChatTextDelta);
      socket.off('chat_thinking_start', onChatThinkingStart);
      socket.off('chat_thinking_delta', onChatThinkingDelta);
      socket.off('chat_tool_use_start', onChatToolUseStart);
      socket.off('chat_tool_use', onChatToolUse);
      socket.off('chat_tool_result', onChatToolResult);
      socket.off('chat_done', onChatDone);
      socket.off('chat_error', onChatError);
    };
  }, [
    setInitial,
    apply,
    setEntityAreaMap,
    setConnection,
    setInitialAreas,
    setAreas,
    applyPreferences,
    chat,
  ]);
}
