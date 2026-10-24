import type { ClassInfo } from './classdb-types.js';
import { BUILTIN_CORE_CLASSES } from './builtin-core-classes.js';
import { BUILTIN_UI_CLASSES } from './builtin-ui-classes.js';

export const BUILTIN_GODOT_CLASSES: Record<string, ClassInfo> = {
  ...BUILTIN_CORE_CLASSES,
  ...BUILTIN_UI_CLASSES
};
