import { useCallback, useRef } from 'react';

/**
 * Throttle "drop within window": llamadas dentro de `ms` desde la última
 * ejecución se descartan. La función original siempre puede invocarse fuera
 * del throttle (ej. en commit final de un slider).
 *
 * Mismo patrón manual que tenían LightCard/MediaPlayerCard con useRef +
 * Date.now(). Lo extraemos para que los cards de cada template no dupliquen
 * la lógica.
 */
export function useThrottle<Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  ms: number,
): (...args: Args) => void {
  const lastRef = useRef<number>(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback(
    (...args: Args) => {
      const now = Date.now();
      if (now - lastRef.current < ms) return;
      lastRef.current = now;
      void fnRef.current(...args);
    },
    [ms],
  );
}
