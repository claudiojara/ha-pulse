# Contribuir a Pulse

## Convención de commits

Este repositorio usa [Conventional Commits](https://www.conventionalcommits.org/)
para que `release-please` decida automáticamente la versión y el changelog.
**El mensaje de cada commit a `main` importa**: la herramienta lo lee y
genera la próxima versión con base en él.

### Tipos válidos

| Tipo       | Cuándo usarlo                                                | Bump      |
|------------|--------------------------------------------------------------|-----------|
| `feat`     | Funcionalidad nueva visible al usuario                       | minor     |
| `fix`      | Bug fix                                                       | patch     |
| `perf`     | Mejora de performance                                         | patch     |
| `refactor` | Refactor sin cambios funcionales                              | patch     |
| `docs`     | Solo documentación                                            | (sin bump)|
| `style`    | Formato, espacios, sin cambios de lógica                      | (sin bump)|
| `test`     | Agregar o ajustar tests                                       | (sin bump)|
| `chore`    | Tareas de mantenimiento                                       | (sin bump)|
| `build`    | Cambios en build system o dependencias                        | (sin bump)|
| `ci`       | Cambios en CI/workflows                                       | (sin bump)|

### Cambios incompatibles (MAJOR bump)

Cualquier commit con `!` después del tipo, o con un footer
`BREAKING CHANGE:`, fuerza un bump MAJOR:

```
feat!: rename anthropic_api_key option to claude_key

BREAKING CHANGE: existing users must re-set the option after upgrade.
```

### Scope (opcional pero recomendado)

Para indicar el área del cambio, ponlo entre paréntesis:

```
feat(chat): support whisper for voice input
fix(ingress): handle trailing slash in panel path
chore(deps): bump @anthropic-ai/sdk to 0.30.0
```

Scopes que ya usamos: `addon`, `api`, `web`, `chat`, `ingress`, `db`,
`build`, `ci`, `deps`.

### Ejemplos

```
feat(api): add /api/zones endpoint to list HA zones
fix(chat): handle tool_use with empty args block
docs(readme): clarify Anthropic key setup
chore(deps): bump fastify to 5.2
ci: cache pnpm store between runs
```

## Flujo de release

`release-please` corre automáticamente en cada push a `main`. Mantiene
abierto un PR titulado `chore(main): release X.Y.Z` que va acumulando los
commits desde el último release.

Cuando estés listo para publicar:

1. Mergeás el PR de release-please.
2. Se crea el tag `vX.Y.Z` y un GitHub Release con el changelog.
3. El workflow construye y publica `ghcr.io/claudiojara/ha-pulse:X.Y.Z`
   (multi-arch amd64 + aarch64).
4. Los usuarios de Home Assistant ven _Update available_ en el panel de
   Pulse.

Documentación operativa completa: `ha-dashboard/RELEASING.md`.

## Desarrollo local

```bash
# Iterar contra HA OS local (Tailscale + ha apps update/rebuild):
./deploy-local.sh
./deploy-local.sh --logs    # tail logs después del deploy
```

`deploy-local.sh` usa el slug `pulse-dev` (no `pulse`), así que tu
versión de desarrollo coexiste con la versión publicada del catálogo
sin pisarla. Útil para A/B testing.

Detalles de la pipeline de deploy + gotchas del Supervisor:
`ha-dashboard/LESSONS.md`.
