/**
 * @file wiki-suite.ts
 * Authoritative 11-page Living Architecture Wiki Suite for Aegis.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from './types.js';
import {
  HOME_PAGE,
  ARCHITECTURE_PAGE,
  RFC_INDEX_PAGE,
  SPEC_MEMORY_PAGE,
  SPEC_GODOT_PAGE,
  SPEC_QUALITY_PAGE,
  SPEC_WORKTREE_PAGE,
  SPEC_DIAGNOSTIC_PAGE,
  SPEC_NOTEBOOKLM_PAGE,
  SPEC_TOOLCHAIN_PAGE,
  RESEARCH_INDEX_PAGE
} from './wiki-pages/index.js';

export { WikiSuitePage };

export const DEFAULT_WIKI_SUITE: WikiSuitePage[] = [
  HOME_PAGE,
  ARCHITECTURE_PAGE,
  RFC_INDEX_PAGE,
  SPEC_MEMORY_PAGE,
  SPEC_GODOT_PAGE,
  SPEC_QUALITY_PAGE,
  SPEC_WORKTREE_PAGE,
  SPEC_DIAGNOSTIC_PAGE,
  SPEC_NOTEBOOKLM_PAGE,
  SPEC_TOOLCHAIN_PAGE,
  RESEARCH_INDEX_PAGE
];
