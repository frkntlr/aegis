import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  generateDiscussionResearchBody,
  generateCleanWikiArchitecture,
  cleanseExistingRfcForWiki
} from './rfc-templates.js';

test('generates rich 5-part research discussion body', () => {
  const body = generateDiscussionResearchBody(10, 'Distributed Event Bus', 'High throughput event delivery', [
    'packages/core/event-bus/src/bus.ts'
  ]);
  assert.ok(body.includes('# 💡 RFC-010: Distributed Event Bus'));
  assert.ok(body.includes('## 1. 🎯 Fikir & Vizyon (Vision & Proposed Concept)'));
  assert.ok(body.includes('High throughput event delivery'));
  assert.ok(body.includes('## 2. 🔬 Araştırma & Mevcut Durum Analizi'));
  assert.ok(body.includes('## 3. 💬 Tartışılacak Konular & Açık Sorular'));
  assert.ok(body.includes('## 4. ⚠️ Riskler & Etki Alanı Analizi'));
  assert.ok(body.includes('packages/core/event-bus/src/bus.ts'));
  assert.ok(body.includes('## 5. 📋 Gelişen Hipotezler & Kabul Kriterleri Taslağı'));
});

test('generates fallback list when no suggested files are provided', () => {
  const body = generateDiscussionResearchBody(1, 'Simple RFC', '');
  assert.ok(body.includes('*(Araştırma sürecinde netleştirilecek)*'));
  assert.ok(body.includes('# 💡 RFC-001: Simple RFC'));
});

test('generates authoritative clean-room wiki architecture artifact', () => {
  const artifact = generateCleanWikiArchitecture(10, 'Distributed Event Bus', 'Clean production event bus', [
    'packages/core/event-bus/src/bus.ts'
  ]);
  assert.strictEqual(artifact.title, 'RFC-010: Distributed Event Bus — Sistem Mimarisi');
  assert.strictEqual(artifact.threeBullets.length, 3);
  assert.ok(artifact.cleanContent.includes('## 1. 📐 Sistem Mimarisi ve Bileşen Topolojisi'));
  assert.ok(artifact.cleanContent.includes('Clean production event bus'));
  assert.ok(artifact.cleanContent.includes('flowchart TD'));
  assert.ok(artifact.cleanContent.includes('## 2. ⚙️ Çalışma Prensibi ve Veri Akışı'));
  assert.ok(artifact.cleanContent.includes('## 3. 💻 CLI ve API Referansı'));
  assert.ok(artifact.cleanContent.includes('## 4. 🔒 Demir Kafes Standartları'));
  assert.ok(artifact.cleanContent.includes('## 5. 📊 Üretim Doğrulama ve Performans Metrikleri'));
});

test('cleanses raw markdown RFC into clean-room wiki specification', () => {
  const rawRfc = [
    '# 🏛️ RFC-005: Language-Specific Clean Architecture',
    '## 🔍 1. Fikir ve Problem Tanımı',
    'Ultra-strict Godot 4 and TypeScript decoupling rules.',
    '## Files:',
    'packages/core/iron-cage/src/clean-architecture-rules.ts'
  ].join('\n');
  const cleansed = cleanseExistingRfcForWiki('RFC-005-clean', rawRfc);
  assert.strictEqual(cleansed.title, 'RFC-005: Language-Specific Clean Architecture — Sistem Mimarisi');
  assert.ok(cleansed.cleanContent.includes('Ultra-strict Godot 4 and TypeScript decoupling rules.'));
  assert.ok(cleansed.cleanContent.includes('clean-architecture-rules.ts'));
});
