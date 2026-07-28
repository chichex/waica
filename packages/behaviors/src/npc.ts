import { defineRole, type RoleGraph } from '@waica/engine'

/** The state graph new NPCs start with, as prefab data. */
export const NPC_STATE_GRAPH: RoleGraph = {
  initial: 'idle',
  states: { idle: {} },
}

// The bystander role: no driver and no code — the character stands where
// you put it, playing its idle animation, and hurts no one. Bring it to
// life by adding states (defineStates('npc', {...})) and behaviours.
defineRole('npc', {
  description:
    'Stands where you put it — no input, no movement, harmless. Good for ' +
    'villagers and signposts. Give it states to bring it to life.',
  graph: NPC_STATE_GRAPH,
})
