import { PLATFORMER_PALETTE } from '@waica/archetype-platformer'

export function Palette() {
  return (
    <section className="ed-panel">
      <header className="ed-panel-head">
        <span>Piezas</span>
        <span className="ed-hint">arrastrá al viewport</span>
      </header>
      <div className="ed-palette">
        {PLATFORMER_PALETTE.map((template) => (
          <div
            key={template.label}
            className="ed-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('waica/template', template.label)
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <span>{template.icon}</span> {template.label}
          </div>
        ))}
      </div>
    </section>
  )
}
