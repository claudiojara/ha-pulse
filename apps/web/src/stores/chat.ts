import type {
  ChatDoneEvent,
  ChatItem,
  ChatToolResultEvent,
  ChatToolUseEvent,
} from '@dashboard-web/shared';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

export type { ChatItem };

interface ChatState {
  items: ChatItem[];
  /** True desde que se manda el mensaje hasta chat_done o chat_error. */
  busy: boolean;
  /** Última métrica de uso reportada por chat_done (para mostrar tokens/cache hit). */
  lastUsage: ChatDoneEvent['usage'] | null;
  /** Modelo del último turn (haiku/sonnet) para mostrar como badge en el header. */
  lastModel: string | null;
  /** Timestamp del último mensaje enviado para calcular TTFC. */
  pendingSentAt: number | null;
  /** Time To First Chunk en ms del último turn. */
  lastTtfcMs: number | null;

  applyHistory: (items: ChatItem[]) => void;
  pushUser: (text: string) => void;
  noteFirstChunk: () => void;
  startText: () => void;
  appendText: (delta: string) => void;
  startThinking: () => void;
  appendThinking: (delta: string) => void;
  startToolUse: (event: { id: string; name: string }) => void;
  finalizeToolUse: (event: ChatToolUseEvent) => void;
  setToolResult: (event: ChatToolResultEvent) => void;
  done: (event: ChatDoneEvent) => void;
  error: (message: string) => void;
  setBusy: (busy: boolean) => void;
  reset: () => void;
}

let counter = 0;
const nextId = (prefix: string): string => `${prefix}_${Date.now()}_${counter++}`;

export const useChatStore = create<ChatState>((set, get) => ({
  items: [],
  busy: false,
  lastUsage: null,
  lastModel: null,
  pendingSentAt: null,
  lastTtfcMs: null,

  applyHistory: (items) => set({ items }),

  pushUser: (text) =>
    set((s) => ({
      items: [...s.items, { kind: 'user', id: nextId('user'), text }],
      pendingSentAt: Date.now(),
      lastTtfcMs: null,
    })),

  noteFirstChunk: () => {
    const { pendingSentAt } = get();
    if (pendingSentAt == null) return;
    set({ lastTtfcMs: Date.now() - pendingSentAt, pendingSentAt: null });
  },

  setBusy: (busy) => set({ busy }),

  startText: () => {
    const id = nextId('asst_text');
    set((s) => ({
      items: [...s.items, { kind: 'assistant_text', id, text: '', streaming: true }],
    }));
  },

  appendText: (delta) =>
    set((s) => {
      const items = [...s.items];
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const it = items[i];
        if (it && it.kind === 'assistant_text' && it.streaming) {
          items[i] = { ...it, text: it.text + delta };
          return { items };
        }
      }
      // No había uno activo (corner case): crear uno con el delta.
      items.push({
        kind: 'assistant_text',
        id: nextId('asst_text'),
        text: delta,
        streaming: true,
      });
      return { items };
    }),

  startThinking: () => {
    const id = nextId('thinking');
    set((s) => ({
      items: [...s.items, { kind: 'thinking', id, text: '', streaming: true }],
    }));
  },

  appendThinking: (delta) =>
    set((s) => {
      const items = [...s.items];
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const it = items[i];
        if (it && it.kind === 'thinking' && it.streaming) {
          items[i] = { ...it, text: it.text + delta };
          return { items };
        }
      }
      return { items };
    }),

  startToolUse: ({ id, name }) =>
    set((s) => ({
      items: [
        ...s.items,
        { kind: 'tool_use', id, name, input: undefined, streaming: true },
      ],
    })),

  finalizeToolUse: ({ id, name, input }) =>
    set((s) => ({
      items: s.items.map((it) =>
        it.kind === 'tool_use' && it.id === id ? { ...it, name, input } : it,
      ),
    })),

  setToolResult: (event) =>
    set((s) => ({
      items: s.items.map((it) =>
        it.kind === 'tool_use' && it.id === event.id
          ? { ...it, result: event, streaming: false }
          : it,
      ),
    })),

  done: (event) => {
    set((s) => ({
      items: s.items.map((it) =>
        (it.kind === 'assistant_text' || it.kind === 'thinking') && it.streaming
          ? { ...it, streaming: false }
          : it,
      ),
      busy: false,
      lastUsage: event.usage,
      lastModel: event.model,
    }));
  },

  error: (message) =>
    set((s) => ({
      items: [...s.items, { kind: 'error', id: nextId('err'), message }],
      busy: false,
      pendingSentAt: null,
    })),

  reset: () =>
    set({
      items: [],
      busy: false,
      lastUsage: null,
      lastModel: null,
      pendingSentAt: null,
      lastTtfcMs: null,
    }),
}));

export function useChatItems(): ChatItem[] {
  return useChatStore(useShallow((s) => s.items));
}
