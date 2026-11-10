import { atom } from 'tldraw'

// Cards that should play their entrance, keyed by card id -> delay in ms.
export const entering = new Map()
// Cards fading out before removal.
export const leaving = atom('leaving', new Set())
// Where an agent is currently writing, for the ghost cursor.
export const agentCursor = atom('agentCursor', null)
export const presence = atom('presence', [])
export const boardMeta = atom('boardMeta', { title: '' })
// "Take another pass": idle → saved (no agent waiting) or reading (an agent took it) → idle.
// The card whose source passage is open in the reader, or null.
export const reading = atom('reading', null)
export const passState = atom('passState', { phase: 'idle' })

export const cardShapeId = (id) => `shape:${id}`
export const clusterShapeId = (id) => `shape:cl.${id}`
export const idFromShape = (shapeId) => shapeId.replace(/^shape:(cl\.)?/, '')
