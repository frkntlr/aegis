import type { ClassInfo } from './classdb-types.js';
import { BUILTIN_UI_BASE } from './builtin-ui-base.js';
import { BUILTIN_UI_INPUTS } from './builtin-ui-inputs.js';

export { BUILTIN_UI_BASE } from './builtin-ui-base.js';
export { BUILTIN_UI_INPUTS } from './builtin-ui-inputs.js';

export const BUILTIN_UI_ELEMENTS: Record<string, ClassInfo> = {
  ...BUILTIN_UI_BASE,
  ...BUILTIN_UI_INPUTS
};
