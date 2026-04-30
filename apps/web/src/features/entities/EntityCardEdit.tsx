import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeOff, GripVertical, Pencil } from 'lucide-react';
import { useState } from 'react';
import { setHiddenPref, setOverridePref } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useEntity } from '@/stores/entities';
import { useIsHidden, useOverride } from '@/stores/preferences';
import { EntityCard } from './EntityCard';

interface EntityCardEditProps {
  entityId: string;
}

/**
 * Versión "editable" de EntityCard. La envuelve y agrega drag handle, botón de
 * ocultar/mostrar y botón de renombrar (prompt simple). Estilizado con un
 * borde dashed para distinguirlo del modo normal.
 */
export function EntityCardEdit({ entityId }: EntityCardEditProps) {
  const entity = useEntity(entityId);
  const hidden = useIsHidden(entityId);
  const override = useOverride(entityId);
  const [renaming, setRenaming] = useState(false);

  const sortable = useSortable({ id: entityId });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  if (!entity) return null;

  const currentName = entity.attributes.friendly_name ?? entity.entity_id;

  const handleRename = async () => {
    if (renaming) return;
    setRenaming(true);
    const next = window.prompt(
      `Nombre custom para ${entity.entity_id}\n(vacío para usar el nombre original)`,
      override?.custom_name ?? '',
    );
    if (next !== null) {
      await setOverridePref({
        entity_id: entityId,
        custom_name: next.trim() || null,
        custom_icon: override?.custom_icon ?? null,
      });
    }
    setRenaming(false);
  };

  const handleToggleHidden = async () => {
    await setHiddenPref({ entity_id: entityId, hidden: !hidden });
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        'relative rounded-lg outline outline-1 outline-dashed outline-primary/40',
        sortable.isDragging && 'opacity-60',
        hidden && 'opacity-50',
      )}
    >
      <div className="pointer-events-none">
        <EntityCard entityId={entityId} />
      </div>
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-background/95 p-0.5 shadow-sm">
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Arrastrar para reordenar"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleRename}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Renombrar ${currentName}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggleHidden}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={hidden ? `Mostrar ${currentName}` : `Ocultar ${currentName}`}
        >
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
