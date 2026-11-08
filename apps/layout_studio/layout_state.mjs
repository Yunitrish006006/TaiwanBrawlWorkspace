const stages = new Set(['sketch', 'visual']);

export function serializeLayoutEditorState(design, stage) {
  if (!stages.has(stage)) throw new Error('Invalid layout editor stage');
  return JSON.stringify({ ...design, stage });
}

export function parseLayoutEditorState(source) {
  if (typeof source !== 'string') return null;
  try {
    const saved = JSON.parse(source);
    if (!saved || typeof saved !== 'object' || !Array.isArray(saved.components)) {
      return null;
    }
    const { stage, ...design } = saved;
    return { design, stage: stages.has(stage) ? stage : 'sketch' };
  } catch {
    return null;
  }
}
