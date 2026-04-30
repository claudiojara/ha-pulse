import Anthropic from '@anthropic-ai/sdk';
import type { Socket } from 'socket.io';
import type {
  ChatItem,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dashboard-web/shared';
import { config } from '../config.js';
import type { PrefsDb } from '../db/db.js';
import type { HaClient } from '../ha/client.js';
import { type ToolContext, executeTool, tools } from './tools.js';

/** Sliding window: cuántos mensajes (de cualquier rol) retenemos. */
const MAX_TURNS = 30;

/** Modelos. Auto-switch arranca en Haiku para queries triviales. */
const HAIKU_MODEL = 'claude-haiku-4-5';
const SONNET_MODEL = 'claude-sonnet-4-6';

/**
 * System prompt cacheado. NO interpolar timestamps, IDs ni cosas variables.
 * Cualquier byte que cambie acá invalida el cache.
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
  /** Modelo activo para esta sesión. Una vez que escala a Sonnet queda ahí hasta reset. */
  model: typeof HAIKU_MODEL | typeof SONNET_MODEL;
  loaded: boolean;
}

const sessions = new Map<string, ConversationState>();

function getSession(socketId: string, db: PrefsDb): ConversationState {
  let s = sessions.get(socketId);
  if (!s) {
    s = { messages: [], model: HAIKU_MODEL, loaded: false };
    sessions.set(socketId, s);
  }
  if (!s.loaded) {
    // Cargar historial persistido. Si encontramos algún tool_use en el historial,
    // significa que ya se "escaló" antes — arrancamos directamente en Sonnet.
    const stored = db.getChatHistory();
    let escalated = false;
    for (const row of stored) {
      const content = JSON.parse(row.content_json) as Anthropic.MessageParam['content'];
      s.messages.push({ role: row.role, content } as Anthropic.MessageParam);
      if (row.role === 'assistant' && Array.isArray(content)) {
        if (content.some((b) => b.type === 'tool_use')) escalated = true;
      }
    }
    if (escalated) s.model = SONNET_MODEL;
    s.loaded = true;
  }
  return s;
}

export function disposeChatSession(socketId: string): void {
  sessions.delete(socketId);
}

/**
 * Recorta mensajes manteniendo los últimos MAX_TURNS, preservando que el primer
 * mensaje sea un user con texto y no un tool_result huérfano.
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
  loadHistoryItems(socketId: string): ChatItem[];
}

type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function createChatRunner(opts: { ha: HaClient; db: PrefsDb }): ChatRunner | null {
  if (!config.anthropic.apiKey) return null;
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  return {
    reset(socket) {
      sessions.delete(socket.id);
      opts.db.clearChatHistory();
    },

    loadHistoryItems(socketId) {
      const state = getSession(socketId, opts.db);
      return convertToItems(state.messages);
    },

    async send(text, socket) {
      const state = getSession(socket.id, opts.db);
      const userMsg: Anthropic.MessageParam = { role: 'user', content: text };
      state.messages.push(userMsg);
      opts.db.appendChatMessage('user', JSON.stringify(text));

      try {
        await runAgenticLoop(client, state, socket, opts.ha, opts.db);
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
  db: PrefsDb,
): Promise<void> {
  const entityArea = await ha.getEntityAreaMap();
  const ctx: ToolContext = { ha, entityArea };

  while (true) {
    const isHaiku = state.model === HAIKU_MODEL;
    // Haiku 4.5 NO soporta ni `adaptive thinking` ni `output_config.effort` —
    // los reservamos para Sonnet. Para Haiku confiamos en su rapidez nativa.
    const baseRequest: Anthropic.MessageStreamParams = {
      model: state.model,
      max_tokens: isHaiku ? 8000 : 16000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [...tools] as Anthropic.Tool[],
      messages: state.messages,
      ...(isHaiku
        ? {}
        : { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } }),
    };

    const stream = client.messages.stream(baseRequest);

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
    db.appendChatMessage('assistant', JSON.stringify(finalMessage.content));

    if (finalMessage.stop_reason === 'tool_use' && completedToolUses.length > 0) {
      // El primer tool_use de la sesión escala el modelo a Sonnet para razonar
      // mejor sobre tool_results. La invalidación del prefix cache es one-time.
      if (state.model === HAIKU_MODEL) state.model = SONNET_MODEL;

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
      const toolMsg: Anthropic.MessageParam = { role: 'user', content: toolResults };
      state.messages.push(toolMsg);
      db.appendChatMessage('user', JSON.stringify(toolResults));
      continue;
    }

    socket.emit('chat_done', {
      stop_reason: finalMessage.stop_reason ?? null,
      model: state.model,
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

let itemCounter = 0;
function nextItemId(prefix: string): string {
  itemCounter += 1;
  return `${prefix}_${Date.now()}_${itemCounter}`;
}

/**
 * Reconstruye ChatItems a partir del array de Anthropic.MessageParam persistido.
 * Se usa al reconectar para repintar el chat con el historial existente.
 */
function convertToItems(messages: Anthropic.MessageParam[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        items.push({ kind: 'user', id: nextItemId('user'), text: msg.content });
        continue;
      }
      if (!Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          // Encontrar el tool_use item con ese id y setear su result.
          const target = items.find(
            (it) => it.kind === 'tool_use' && it.id === block.tool_use_id,
          );
          if (target && target.kind === 'tool_use') {
            const raw =
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content);
            let parsed: unknown = raw;
            try {
              parsed = JSON.parse(raw);
            } catch {
              // dejar como string raw
            }
            target.result = {
              id: block.tool_use_id,
              result: parsed,
              is_error: block.is_error ?? false,
            };
            target.streaming = false;
          }
        } else if (block.type === 'text') {
          items.push({ kind: 'user', id: nextItemId('user'), text: block.text });
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        items.push({
          kind: 'assistant_text',
          id: nextItemId('asst'),
          text: msg.content,
          streaming: false,
        });
        continue;
      }
      if (!Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        if (block.type === 'text') {
          items.push({
            kind: 'assistant_text',
            id: nextItemId('asst'),
            text: block.text,
            streaming: false,
          });
        } else if (block.type === 'thinking') {
          items.push({
            kind: 'thinking',
            id: nextItemId('thinking'),
            text: block.thinking,
            streaming: false,
          });
        } else if (block.type === 'tool_use') {
          items.push({
            kind: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
            streaming: false,
          });
        }
      }
    }
  }
  return items;
}
