/**
 * @file spec-notebooklm.ts
 * Specification: Google NotebookLM Deep Research & Living Knowledge Lifecycle.
 * Covers: RFC-001, RFC-017, RFC-018, RFC-020, RFC-021, RFC-022, RFC-023.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_NOTEBOOKLM_PAGE: WikiSuitePage = {
  slug: 'Spec-NotebookLM-and-Knowledge',
  title: 'Mimari Spesifikasyon: NotebookLM Derin Araştırma & Yaşayan Bilgi',
  threeBullets: [
    'Doğrulanmış zemin kaynakları ([cite: x, y]) ile halüsinasyonsuz mimari sentez ve 3 katmanlı zemin bilgisi.',
    'Otonom Bilgi Yönetimi (AKG): 50-kaynak Quota Sentinel, MFCS budama ve Mezar Taşı Mahzeni (.aegis/tombstones/).',
    'Kapsanan Kararlar: RFC-001, RFC-017, RFC-018, RFC-020, RFC-021, RFC-022, RFC-023.'
  ],
  content: [
    '## 🔬 Mimari Spesifikasyon: NotebookLM & Yaşayan Bilgi Döngüsü',
    '',
    'Aegis, karmaşık mimari kararlar ve kütüphane seçimlerinde LLM\'lerin ezbere ve sıklıkla yanıltıcı cevaplar vermesini engellemek için Google NotebookLM\'i birincil zemin gerçeği araştırma motoru olarak kullanır. Bu spesifikasyon; RFC-001, RFC-017, RFC-018, RFC-020, RFC-021, RFC-022 ve RFC-023 kararlarının sentezidir.',
    '',
    '```mermaid',
    'flowchart TD',
    '  RESEARCH["aegis nlm:research <konu>"] --> SYNTH["NotebookLM Sentezi & Alıntılar [cite: x, y]"]',
    '  SYNTH --> WIKI["Yaşayan GitHub Wiki (research-*.md)"]',
    '  WIKI --> AKG["Otonom Bilgi Yönetimi (AKG)"]',
    '  AKG --> SENTINEL["50-Kaynak Quota Sentinel & Freshness Radar"]',
    '  SENTINEL --> MFCS["MFCS Puanlama & aegis nlm:prune"]',
    '  MFCS --> VAULT[".aegis/tombstones/ (Mezar Taşı Mahzeni)"]',
    '  VAULT --> RESTORE["aegis nlm:restore (Sıfır Veri Kaybı)"]',
    '```',
    '',
    '---',
    '',
    '### 1. Zemin Gerçeği ve Kaynak Alıntıları (`[cite: x, y]`) (RFC-001, RFC-017)',
    '- Modelin ürettiği her mimari tespiti gerçek belgelere ve web kaynaklarına bağlar (`[cite: 1, 3, 12]`).',
    '- Mimari kararlar "varsayım" olmaktan çıkar, doğrulanabilir teknik kararlara (ADR) dönüşür.',
    '- Sıfır-Chromium köprüsü (`@aegis/github-live`) ile hafif ve güvenli HTTP/JSON bağlantısı sağlanır.',
    '',
    '---',
    '',
    '### 2. Otonom Bilgi Yönetimi (AKG) & Mezar Taşı Mahzeni (RFC-023)',
    '- **50-Kaynak Quota Sentinel:** Kaynak sayısı 45\'i aştığında proaktif uyarır; 50 tavanında yeni kaynak eklenmesini durdurur.',
    '- **Source Freshness Radar:** 30 günden eski veya güncel mimariyle ilgisizleşen bayat kaynakları tespit eder.',
    '- **MFCS (Multi-Factor Content Scoring) Budama (`aegis nlm:prune`):** Alıntı sıklığı, tazelik ve konu alaka puanına göre en zayıf kaynakları belirler.',
    '- **Yerel Mezar Taşı Mahzeni (Tombstone Vault):** Budanan kaynaklar silinmeden önce `.aegis/tombstones/` altında meta verileriyle arşivlenir; `aegis nlm:restore <id>` ile anında geri yüklenir.',
    '',
    '---',
    '',
    '### 3. Sıfır-Tıklama Ortam Hasatçısı & Tri-State Protokolü (RFC-020, RFC-021, RFC-022)',
    '- **Ortam Hasatçısı (Ambient Harvester):** Çalışan Chrome, Edge veya Brave tarayıcılarının CDP portlarını (9222-9229) ve DPAPI şifreli çerez kasalarını otomatik tarar.',
    '- **Konuşma Odaklı Hesap Değiştirme (`aegis nlm:switch`):** Kullanıcı hesap değiştirmek istediğinde eski oturum `.notebooklm-mcp/auth.backup-<ts>.json` içine yedeklenir.',
    '- **Tri-State Modal Protokolü:** Oturum süresi dolduğunda ajan sessizce başarısız olmaz; kullanıcıya 3 seçenek sunar (Yenile, Çevrimdışı Devam Et, İptal Et).',
    '',
    '---',
    '',
    '### 💻 NotebookLM Komut Referansı',
    '| Komut | Görev |',
    '|---|---|',
    '| `aegis nlm:query "<soru>"` | Doğrulanmış zemin alıntılarıyla NotebookLM\'e soru sorar. |',
    '| `aegis nlm:research "<konu>"` | Otonom derin araştırma başlatır ve sonucu Wiki\'ye aktarır. |',
    '| `aegis nlm:prune [--dry-run]` | Otonom MFCS puanlamasıyla bayat kaynakları budar ve mahzene arşivler. |',
    '| `aegis nlm:restore <id>` | Arşivlenmiş bir kaynağı mezar taşı mahzeninden geri yükler. |',
    '| `aegis nlm:switch [tarayıcı]` | Hesabı güvenle yedekleyip sıfır tıklamayla değiştirir. |',
    '| `aegis nlm:sources` | Aktif kaynakları, tazelik durumlarını ve alıntı sayılarını listeler. |'
  ].join('\n')
};
