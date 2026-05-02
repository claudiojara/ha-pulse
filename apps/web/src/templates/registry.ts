import type { ComponentType } from 'react';
import { usePref } from '@/stores/preferences';
import { baseTemplate } from './base';
import { glassTemplate } from './glass';

export type TemplateId = 'base' | 'glass';

export interface CardComponentProps {
  entityId: string;
}

export type CardComponent = ComponentType<CardComponentProps>;

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  /** Mapping domain → componente de card. Dominios ausentes caen a `UnsupportedCard`. */
  cards: Partial<Record<string, CardComponent>>;
  /**
   * Componente opcional renderizado detrás del shell del app cuando este template
   * está activo. Útil para fondos elaborados (orbs, gradients, scenes).
   */
  Background?: ComponentType;
}

/** Pref key persistida en SQLite (user_prefs) — define qué template está activo. */
export const ACTIVE_TEMPLATE_PREF_KEY = 'active_template_id';

/** Template usado cuando no hay preferencia o el id guardado no existe en el registry. */
export const DEFAULT_TEMPLATE_ID: TemplateId = 'base';

const TEMPLATES: Record<TemplateId, Template> = {
  base: baseTemplate,
  glass: glassTemplate,
};

function isKnownTemplateId(id: string | undefined): id is TemplateId {
  return id !== undefined && id in TEMPLATES;
}

/** Hook reactivo: devuelve el template activo según `user_prefs.active_template_id`. */
export function useActiveTemplate(): Template {
  const id = usePref(ACTIVE_TEMPLATE_PREF_KEY);
  const resolvedId = isKnownTemplateId(id) ? id : DEFAULT_TEMPLATE_ID;
  return TEMPLATES[resolvedId];
}

export function getTemplate(id: TemplateId): Template {
  return TEMPLATES[id] ?? TEMPLATES[DEFAULT_TEMPLATE_ID];
}

export function listTemplates(): Template[] {
  return Object.values(TEMPLATES);
}
