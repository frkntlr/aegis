/**
 * @file architecture.ts
 * Master Architecture Guide for Aegis Living Memory.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';
import { ARCHITECTURE_CORE_CONTENT } from './architecture-core.js';
import { ARCHITECTURE_ENGINE_CONTENT } from './architecture-engine.js';

export const ARCHITECTURE_PAGE: WikiSuitePage = {
  slug: 'Architecture',
  title: 'Aegis Kapsamlı Mimari Rehberi & Otonom Koşum Düzeni',
  threeBullets: [
    'Git Worktree fiziksel izolasyonu, 14-paket modüler monorepo ve TIP çekme tabanlı görev protokolü.',
    '27-araçlık birleşik yerel MCP ekosistemi, 5-katmanlı kod hafızası ve Godot Substrate 3.0 motor köprüsü.',
    'Deterministik Demir Kafes (300/40), Sokratik teşhis, %70 mutasyon test kapısı ve 4 adımlı atomik merge pipeline.'
  ],
  content: [
    ...ARCHITECTURE_CORE_CONTENT,
    '',
    '---',
    '',
    ...ARCHITECTURE_ENGINE_CONTENT
  ].join('\n')
};
