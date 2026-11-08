import { parseLayoutSpec } from './layout_schema.mjs';
import { serializeLayoutEditorState } from './layout_state.mjs';

export const layoutStorageKey = 'taiwan-brawl-layout-studio-v1';

export function importAndPersistLayout(source, storage) {
  const imported = parseLayoutSpec(source);
  const design = {
    screenName: imported.screenName,
    viewport: imported.viewport,
    theme: imported.theme,
    colors: imported.colors,
    components: imported.components,
  };
  storage.setItem(
    layoutStorageKey,
    serializeLayoutEditorState(design, imported.stage),
  );
  return { design, stage: imported.stage };
}
