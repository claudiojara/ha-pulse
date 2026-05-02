import { type ReactNode, useEffect } from 'react';
import { useActiveTemplate } from './registry';

interface TemplateRootProps {
  children: ReactNode;
}

/**
 * Wrapper que aplica el template activo al app shell:
 *   1. Agrega/quita la clase `template-${id}` al `<body>` para que las CSS vars
 *      y selectores específicos del template entren en alcance.
 *   2. Renderiza el `Background` del template (si lo define) detrás del contenido.
 *
 * Mountar UNA sola vez en el root layout.
 */
export function TemplateRoot({ children }: TemplateRootProps) {
  const template = useActiveTemplate();

  useEffect(() => {
    const className = `template-${template.id}`;
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }, [template.id]);

  const Background = template.Background;

  return (
    <>
      {Background && <Background />}
      {children}
    </>
  );
}
