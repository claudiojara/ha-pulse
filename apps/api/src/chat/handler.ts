import Anthropic from '@anthropic-ai/sdk';
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dashboard-web/shared';
import { config } from '../config.js';
import type { HaClient } from '../ha/client.js';
import { type ToolContext, executeTool, tools } from './tools.js';

/**
 * Sliding window: cuántos turnos máximos retenemos en memoria.
 * Un "turno" = un message (user / assistant / tool_result aggregator).
 */
const MAX_TURNS = 30;

/**
 * Default `effort` para Sonnet 4.6. `medium` balancea calidad vs costo.
 * Para queries más complejas el agente puede usar más tokens; thinking adaptativo
 * decide solo cuándo pensar.
 */
const DEFAULT_EFFORT = 'medium' as const;

/**
 * System prompt cacheado. Estable entre requests — cualquier cambio en este string
 * invalida el cache. NO interpolar timestamps, IDs ni cosas variables acá.
 * (Ver shared/prompt-caching.md → silent invalidators.)
 */
const SYSTEM_PROMPT = `Sos un asistente conversacional para un dashboard de Home Assistant. Hablás en castellano rioplatense, directo y al grano.

Tu trabajo es ayudar al usuario a inspeccionar y controlar sus dispositivos de HA. Tenés tools para:
- Listar áreas (habitaciones).
- Buscar entidades por nombre amigable o entity_id.
- Leer el state actual de una entidad.
- Llamar servicios de HA (turn_on/off, set_temperature, volume_set, etc.).
- Consultar historial reciente.

Pautas:
1. Si el usuario pide algo ambiguo ("apagá las luces"), primero usá search_entities y/o list_areas para descubrir qué entidades aplican, después accioná.
2. Antes de operaciones masivas o destructivas (apagar todas las luces de la casa, llamar a un script desconocido), avisá al usuario y esperá confirmación.
3. Para preguntas tipo "¿está prendida la luz X?" usá get_state y respondé corto.
4. Si una llamada falla, mostrá el error tal cual y proponé un siguiente paso.
5. NO inventes entity_ids. Siempre verificá con search_entities o get_state si tenés dudas.
6. Cuando llamés call_service con success, confirmá lo que hiciste con una frase corta.
7. Mantené las respuestas concisas. Sin preámbulos tipo "Claro, voy a...".`;

interface ConversationState {
  messages: Anthropic.MessageParam[];
}

const sessions = new Map<string, ConversationState>();

function getSession(socketId: string): ConversationState {
  let s = sessions.get(socketId);
  if (!s) {
    s = { messages: [] };
    sessions.set(socketId, s);
  }
  return s;
}

export function disposeChatSession(socketId: string): void {
  sessions.delete(socketId);
}

/**
 * Recorta el array de mensajes manteniendo los últimos MAX_TURNS, pero asegurando
 * que el primero sea siempre un `user` y que cada `tool_use` tenga su `tool_result`.
 * Si el corte deja un tool_use huérfano, descartamos hasta el siguiente user "limpio".
 */
function pruneMessages(state: ConversationState): void {
  if (state.messages.length <= MAX_TURNS) return;
  let start = state.messages.length - MAX_TURNS;
  while (start < state.messages.length) {
    const m = state.messages[start];
    if (!m || m.role !== 'user') {
      start += 1;
      continue;
    }
    // El primer user no puede ser un tool_result aislado — necesita la conversación previa
    // que lo justifica. Avanzar hasta un user con texto plano.
    const content = m.content;
    if (typeof content === 'string') break;
    if (Array.isArray(content) && content.some((c) => c.type === 'text')) break;
    start += 1;
  }
  state.messages = state.messages.slice(start);
}

export interface ChatRunner {
  send(text: string, socket: ChatSocket): Promise<void>;
  reset(socket: ChatSocket): void;
}

type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function createChatRunner(opts: { ha: HaClient }): ChatRunner | null {
  if (!config.anthropic.apiKey) return null;
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  return {
    reset(socket) {
      sessions.delete(socket.id);
    },

    async send(text, socket) {
      const state = getSession(socket.id);
      state.messages.push({ role: 'user', content: text });

      try {
        await runAgenticLoop(client, state, socket, opts.ha);
      } catch (err) {
        const message = err instanceof Anthropic.APIError ? err.message : String(err);
        socket.emit('chat_error', message);
      } finally {
        pruneMessages(state);
      }
    },
  };
}

async function runAgenticLoop(
  client: Anthropic,
  state: ConversationState,
  socket: ChatSocket,
  ha: HaClient,
): Promise<void> {
  // Para search_entities con filtro por área necesitamos el mapa actual.
  const entityArea = await ha.getEntityAreaMap();
  const ctx: ToolContext = { ha, entityArea };

  while (true) {
    // Spread tool list cast — readonly-as-mutable es seguro acá; el SDK no muta.
    const stream = client.messages.stream({
      model: config.anthropic.model,
      max_tokens: 16000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [...tools] as Anthropic.Tool[],
      thinking: { type: 'adaptive' },
      output_config: { effort: DEFAULT_EFFORT },
      messages: state.messages,
    });

    // Track tool_use blocks que se van armando entre content_block_start/_stop.
    type Pending = { id: string; name: string; jsonBuf: string };
    const pendingByIndex = new Map<number, Pending>();
    const completedToolUses: Array<{ id: string; name: string; input: unknown }> = [];

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'text') {
          socket.emit('chat_text_start');
        } else if (block.type === 'tool_use') {
          pendingByIndex.set(event.index, { id: block.id, name: block.name, jsonBuf: '' });
          socket.emit('chat_tool_use_start', { id: block.id, name: block.name });
        } else if (block.type === 'thinking') {
          socket.emit('chat_thinking_start');
        }
      } else if (event.type === 'content_block_delta') {
        const d = event.delta;
        if (d.type === 'text_delta') {
          socket.emit('chat_text_delta', d.text);
        } else if (d.type === 'thinking_delta') {
          socket.emit('chat_thinking_delta', d.thinking);
        } else if (d.type === 'input_json_delta') {
          const p = pendingByIndex.get(event.index);
          if (p) p.jsonBuf += d.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        const p = pendingByIndex.get(event.index);
        if (p) {
          let parsed: unknown = {};
          try {
            parsed = p.jsonBuf ? JSON.parse(p.jsonBuf) : {};
          } catch {
            parsed = { _parse_error: p.jsonBuf };
          }
          completedToolUses.push({ id: p.id, name: p.name, input: parsed });
          socket.emit('chat_tool_use', { id: p.id, name: p.name, input: parsed });
          pendingByIndex.delete(event.index);
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    state.messages.push({ role: 'assistant', content: finalMessage.content });

    if (finalMessage.stop_reason === 'tool_use' && completedToolUses.length > 0) {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of completedToolUses) {
        const { result, isError } = await executeTool(tu.name, tu.input, ctx);
        socket.emit('chat_tool_result', { id: tu.id, result, is_error: isError });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          is_error: isError,
        });
      }
      state.messages.push({ role: 'user', content: toolResults });
      continue;
    }

    socket.emit('chat_done', {
      stop_reason: finalMessage.stop_reason ?? null,
      usage: {
        input_tokens: finalMessage.usage.input_tokens,
        output_tokens: finalMessage.usage.output_tokens,
        cache_read_input_tokens: finalMessage.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
      },
    });
    return;
  }
}
