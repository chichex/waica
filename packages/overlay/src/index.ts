import type { Component, ComponentClass, Game, ParamSpec } from '@waica/engine'

export interface OverlayOptions {
  /** KeyboardEvent.code que abre/cierra el panel. */
  toggleCode?: string
}

const CSS = `
.waica-toggle {
  position: fixed; right: 14px; bottom: 14px; z-index: 99998;
  width: 44px; height: 44px; border-radius: 50%; border: none;
  background: #14141fee; color: #fff; font-size: 22px; cursor: pointer;
  box-shadow: 0 2px 12px #0008;
}
.waica-panel {
  position: fixed; top: 12px; right: 12px; bottom: 70px; z-index: 99999;
  width: 320px; overflow-y: auto; border-radius: 12px;
  background: #14141ff2; color: #e8e8f0;
  font: 13px/1.45 system-ui, sans-serif;
  box-shadow: 0 4px 24px #000a; padding: 0 0 8px;
}
.waica-panel[hidden] { display: none; }
.waica-head {
  position: sticky; top: 0; display: flex; justify-content: space-between;
  align-items: center; padding: 10px 14px; background: #1d1d2bf2;
  border-radius: 12px 12px 0 0; font-weight: 600;
}
.waica-status { font-weight: 400; font-size: 11px; color: #9a9ab0; }
.waica-entity { margin: 6px 10px; }
.waica-entity > summary {
  cursor: pointer; padding: 5px 6px; border-radius: 6px; font-weight: 600;
  color: #ffd166;
}
.waica-entity > summary:hover { background: #ffffff10; }
.waica-comp { margin: 2px 0 10px 12px; }
.waica-comp-name { margin: 4px 0; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.06em; color: #8ecae6; }
.waica-row { display: grid; grid-template-columns: 1fr 80px 52px; gap: 6px;
  align-items: center; margin: 3px 0; }
.waica-row label { color: #c7c7d6; }
.waica-row input[type="range"] { width: 100%; accent-color: #ffb703; }
.waica-row input[type="number"] {
  width: 100%; background: #0e0e16; color: #e8e8f0; border: 1px solid #333;
  border-radius: 4px; padding: 2px 4px; font-size: 12px;
}
.waica-row input[type="checkbox"] { justify-self: start; accent-color: #ffb703; }
`

/**
 * Inspector in-game: lista las entidades, expone los parámetros declarados
 * por cada componente (static params) para editarlos en vivo, y persiste
 * los cambios al proyecto vía el plugin de dev (@waica/overlay/vite).
 *
 * Es el embrión del editor (DESIGN.md, decisión 9): jugar-ajustar-guardar
 * sin salir del juego.
 */
export function attachOverlay(game: Game, options: OverlayOptions = {}): () => void {
  const { toggleCode = 'Backquote' } = options

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const toggle = document.createElement('button')
  toggle.className = 'waica-toggle'
  toggle.textContent = '🐕'
  toggle.title = 'Inspector de Waica (~)'

  const panel = document.createElement('div')
  panel.className = 'waica-panel'
  panel.hidden = true

  const head = document.createElement('div')
  head.className = 'waica-head'
  head.innerHTML = `<span>waica inspector</span><span class="waica-status"></span>`
  const status = head.querySelector<HTMLSpanElement>('.waica-status')!
  const body = document.createElement('div')
  panel.append(head, body)
  document.body.append(toggle, panel)

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleSave = (): void => {
    status.textContent = 'guardando…'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        const res = await fetch('/__waica/params', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(game.paramOverrides),
        })
        status.textContent = res.ok ? 'guardado ✓' : 'sin persistencia'
      } catch {
        status.textContent = 'sin persistencia'
      }
    }, 500)
  }

  const setOverride = (entity: string, comp: string, key: string, value: number | boolean): void => {
    const forEntity = (game.paramOverrides[entity] ??= {})
    const forComp = (forEntity[comp] ??= {})
    forComp[key] = value
    scheduleSave()
  }

  const paramRow = (component: Component, key: string, spec: ParamSpec): HTMLElement => {
    const Class = component.constructor as ComponentClass
    const row = document.createElement('div')
    row.className = 'waica-row'
    const label = document.createElement('label')
    label.textContent = spec.label ?? key
    row.append(label)

    const current = (component as unknown as Record<string, unknown>)[key]
    const apply = (value: number | boolean): void => {
      ;(component as unknown as Record<string, unknown>)[key] = value
      setOverride(component.entity.name, Class.componentName, key, value)
    }

    if (typeof current === 'boolean') {
      const check = document.createElement('input')
      check.type = 'checkbox'
      check.checked = current
      check.addEventListener('input', () => apply(check.checked))
      row.append(check)
      return row
    }

    const range = document.createElement('input')
    range.type = 'range'
    range.min = String(spec.min ?? 0)
    range.max = String(spec.max ?? 100)
    range.step = String(spec.step ?? 0.1)
    range.value = String(current)
    const num = document.createElement('input')
    num.type = 'number'
    num.step = String(spec.step ?? 0.1)
    num.value = String(current)
    range.addEventListener('input', () => {
      num.value = range.value
      apply(Number(range.value))
    })
    num.addEventListener('input', () => {
      range.value = num.value
      apply(Number(num.value))
    })
    row.append(range, num)
    return row
  }

  const rebuild = (): void => {
    body.textContent = ''
    for (const entity of game.entities) {
      const sections: HTMLElement[] = []
      for (const component of entity.components) {
        const Class = component.constructor as ComponentClass
        const params = Class.params
        if (!params || Object.keys(params).length === 0) continue
        const section = document.createElement('div')
        section.className = 'waica-comp'
        const title = document.createElement('div')
        title.className = 'waica-comp-name'
        title.textContent = Class.componentName
        section.append(title)
        for (const [key, spec] of Object.entries(params)) {
          section.append(paramRow(component, key, spec))
        }
        sections.push(section)
      }
      if (sections.length === 0) continue
      const details = document.createElement('details')
      details.className = 'waica-entity'
      details.open = true
      const summary = document.createElement('summary')
      summary.textContent = entity.name
      details.append(summary, ...sections)
      body.append(details)
    }
  }

  const togglePanel = (): void => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) rebuild()
  }
  toggle.addEventListener('click', togglePanel)
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === toggleCode && !e.repeat) togglePanel()
  }
  window.addEventListener('keydown', onKey)

  return () => {
    window.removeEventListener('keydown', onKey)
    clearTimeout(saveTimer)
    toggle.remove()
    panel.remove()
    style.remove()
  }
}
