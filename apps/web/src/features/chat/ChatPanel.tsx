import { Brain, ChevronRight, RotateCcw, Send, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent } from '@/components/ui/card';
import { chatReset, chatSend } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { type ChatItem, useChatItems, useChatStore } from '@/stores/chat';

export function ChatPanel() {
  const items = useChatItems();
  const busy = useChatStore((s) => s.busy);
  const lastUsage = useChatStore((s) => s.lastUsage);
  const lastModel = useChatStore((s) => s.lastModel);
  const lastTtfcMs = useChatStore((s) => s.lastTtfcMs);
  const setBusy = useChatStore((s) => s.setBusy);
  const pushUser = useChatStore((s) => s.pushUser);
  const reset = useChatStore((s) => s.reset);

  const [text, setText] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    pushUser(trimmed);
    setText('');
    setBusy(true);
    const result = await chatSend(trimmed);
    if (!result.ok) {
      useChatStore.getState().error(result.error ?? 'no se pudo enviar');
      setBusy(false);
    }
  };

  const handleReset = async () => {
    reset();
    await chatReset();
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Chat</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hablale al asistente para inspeccionar o controlar tu casa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastModel && (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
                lastModel.includes('haiku')
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-primary/15 text-primary',
              )}
              title={lastModel}
            >
              {lastModel.includes('haiku') ? 'haiku' : 'sonnet'}
            </span>
          )}
          {lastTtfcMs !== null && (
            <span className="text-xs text-muted-foreground" title="Time to first chunk">
              {lastTtfcMs} ms
            </span>
          )}
          {lastUsage && (
            <span className="text-xs text-muted-foreground">
              {lastUsage.cache_read_input_tokens > 0 && (
                <span className="mr-2 text-primary/70">
                  cache: {lastUsage.cache_read_input_tokens}
                </span>
              )}
              {lastUsage.input_tokens}↑ / {lastUsage.output_tokens}↓
            </span>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="flex h-7 items-center gap-1 rounded-md border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Resetear conversación"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 space-y-2 overflow-y-auto rounded-lg border bg-background/40 p-3"
      >
        {items.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Probá: <em className="ml-1">"¿qué luces están prendidas en la sala?"</em>
          </div>
        )}
        {items.map((it) => (
          <ItemView key={it.id} item={it} />
        ))}
        {busy && items.length > 0 && items[items.length - 1]?.kind === 'user' && (
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            pensando...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={busy ? 'Esperando respuesta...' : 'Escribí un mensaje'}
          disabled={busy}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
          Enviar
        </button>
      </form>
    </div>
  );
}

function ItemView({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
            {item.text}
          </div>
        </div>
      );
    case 'assistant_text':
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted/60 px-3 py-2 text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Compactar márgenes default de prose para que no abulten en el bubble
                p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                code: ({ children, ...props }) => {
                  // inline code
                  return (
                    <code
                      className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="my-2 overflow-x-auto rounded bg-background/60 p-2 font-mono text-[0.8em]">
                    {children}
                  </pre>
                ),
                table: ({ children }) => (
                  <div className="my-2 overflow-x-auto">
                    <table className="border-collapse text-xs">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-border/60 px-2 py-1 text-left font-medium">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-border/60 px-2 py-1">{children}</td>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {item.text}
            </ReactMarkdown>
            {item.streaming && (
              <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-foreground/60 align-middle" />
            )}
          </div>
        </div>
      );
    case 'thinking':
      return (
        <details className="group rounded-md border border-dashed border-muted-foreground/30 px-2 py-1 text-xs text-muted-foreground">
          <summary className="flex cursor-pointer items-center gap-1.5">
            <Brain className="h-3 w-3" />
            <span>{item.streaming ? 'pensando...' : 'razonamiento'}</span>
            <ChevronRight className="ml-auto h-3 w-3 transition-transform group-open:rotate-90" />
          </summary>
          <pre className="mt-1 whitespace-pre-wrap font-sans">{item.text}</pre>
        </details>
      );
    case 'tool_use':
      return (
        <ToolUseCard item={item} />
      );
    case 'error':
      return (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-3 text-xs text-destructive">{item.message}</CardContent>
        </Card>
      );
  }
}

function ToolUseCard({ item }: { item: Extract<ChatItem, { kind: 'tool_use' }> }) {
  const status = item.result
    ? item.result.is_error
      ? 'error'
      : 'ok'
    : item.streaming
      ? 'running'
      : 'pending';
  return (
    <details className="group rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
      <summary className="flex cursor-pointer items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <code className="font-mono">{item.name}</code>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
            status === 'ok' && 'bg-primary/15 text-primary',
            status === 'error' && 'bg-destructive/20 text-destructive',
            status === 'running' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
            status === 'pending' && 'bg-muted text-muted-foreground',
          )}
        >
          {status}
        </span>
        <ChevronRight className="ml-auto h-3 w-3 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-2 space-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">args</div>
          <pre className="mt-0.5 overflow-x-auto rounded bg-background/60 p-1.5 font-mono text-[11px]">
            {JSON.stringify(item.input, null, 2)}
          </pre>
        </div>
        {item.result && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              result
            </div>
            <pre className="mt-0.5 max-h-60 overflow-auto rounded bg-background/60 p-1.5 font-mono text-[11px]">
              {JSON.stringify(item.result.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}
