import { setUserPref } from '@/lib/socket';
import {
  ACTIVE_TEMPLATE_PREF_KEY,
  listTemplates,
  useActiveTemplate,
} from '@/templates/registry';

/** Selector compacto de template activo. Persiste vía `set_pref` (Socket.IO). */
export function TemplateSwitcher() {
  const active = useActiveTemplate();
  const templates = listTemplates();

  const handleSelect = (id: string) => {
    if (id === active.id) return;
    void setUserPref({ key: ACTIVE_TEMPLATE_PREF_KEY, value: id });
  };

  return (
    <div className="mt-3 flex flex-col gap-1.5 px-3 pb-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Template
      </span>
      <div className="flex flex-wrap gap-1">
        {templates.map((t) => {
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelect(t.id)}
              aria-pressed={isActive}
              title={t.description}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
