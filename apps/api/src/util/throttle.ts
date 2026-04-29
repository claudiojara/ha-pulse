/**
 * Throttle por clave: el primer evento pasa, los siguientes con la misma clave
 * dentro de la ventana se acumulan en un único trailing call.
 *
 * Útil para state_changed: si una luz cambia 50 veces en 200ms (típico de fades),
 * mandamos solo la primera y la última al cliente.
 */
export function throttleByKey<T>(
  windowMs: number,
  emit: (value: T) => void,
): (key: string, value: T) => void {
  const pending = new Map<string, { value: T; timer: NodeJS.Timeout }>();
  const lastEmit = new Map<string, number>();

  return (key, value) => {
    const now = Date.now();
    const prev = lastEmit.get(key) ?? 0;

    if (now - prev >= windowMs) {
      lastEmit.set(key, now);
      emit(value);
      const queued = pending.get(key);
      if (queued) {
        clearTimeout(queued.timer);
        pending.delete(key);
      }
      return;
    }

    const queued = pending.get(key);
    if (queued) {
      queued.value = value;
      return;
    }

    const remaining = windowMs - (now - prev);
    const timer = setTimeout(() => {
      const entry = pending.get(key);
      if (!entry) return;
      pending.delete(key);
      lastEmit.set(key, Date.now());
      emit(entry.value);
    }, remaining);

    pending.set(key, { value, timer });
  };
}
