import type { ClassInfo } from './classdb-types.js';
import { BUILTIN_UI_CONTAINERS } from './builtin-ui-containers.js';
import { BUILTIN_UI_ELEMENTS } from './builtin-ui-controls.js';

export { BUILTIN_UI_CONTAINERS } from './builtin-ui-containers.js';
export { BUILTIN_UI_ELEMENTS } from './builtin-ui-controls.js';

export const BUILTIN_UI_CLASSES: Record<string, ClassInfo> = {
  ...BUILTIN_UI_CONTAINERS,
  ...BUILTIN_UI_ELEMENTS
};
