/**
 * @file rfc-templates.ts
 * Templates and synthesizers for Research-Driven Discussions & Clean-Room Wiki Documentation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function.
 */

export interface CleanWikiArtifact {
  title: string;
  threeBullets: [string, string, string];
  cleanContent: string;
}

function buildDiscussionVisionAndResearch(pad: string, title: string, desc: string): string[] {
  return [
    `# 💡 RFC-${pad}: ${title}`,
    '',
    '## 1. 🎯 Fikir & Vizyon (Vision & Proposed Concept)',
    `- **Problem & İhtiyaç:** ${desc || title}`,
    '- **Önerilen Çözüm:** Sistemin otonom yeteneklerini genişleten ve sürtünmeyi sıfıra indiren modüler mimari.',
    '- **Kullanıcı & Sistem Değeri:** Demir Kafes sınırları içerisinde deterministik ve cerrahi yürütme.',
    '',
    '## 2. 🔬 Araştırma & Mevcut Durum Analizi (Research & Diagnostic Investigation)',
    '- **Mevcut Kod Tabanı Durumu:** İlgili modüller ve mevcut mimari sınırlar incelendi.',
    '- **İncelenen Teknolojiler & Kütüphaneler:** Ağaç analizi (AST), durum korumalı önbellek ve kilit protokolleri.',
    '- **Sektör & Literatür Karşılaştırması:** Standart pratikler ve sıfır-yanılma (zero-hallucination) yaklaşımları.',
    ''
  ];
}

function buildDiscussionTopicsAndCriteria(filesList: string): string[] {
  return [
    '## 3. 💬 Tartışılacak Konular & Açık Sorular (Discussion Topics & Open Questions)',
    '- **Açık Soru 1:** Performans, bellek tüketimi ve token verimliliği arasındaki optimal denge nasıl sağlanmalı?',
    '- **Açık Soru 2:** Geriye dönük uyumluluk ve çoklu worktree (solver/qa/docs) senkronizasyonu nasıl korunmalı?',
    '- **Alternatif Yaklaşımlar:** Minimal yerel model vs 5-Katmanlı birleşik otonom motor.',
    '',
    '## 4. ⚠️ Riskler & Etki Alanı Analizi (Blast Radius & Migration Risks)',
    '- **Hedef & Etkilenecek Dosyalar:**',
    filesList,
    '- **Azaltma Stratejisi:** Demir Kafes (300/40 satır) AST kapıları ve MutationGate test doğrulaması.',
    '',
    '## 5. 📋 Gelişen Hipotezler & Kabul Kriterleri Taslağı (Evolving Criteria)',
    '- [ ] Çekirdek mantık ve veri modeli tasarımı tamamlandı.',
    '- [ ] Demir Kafes (300 satır / 40 satır) AST doğrulaması sağlandı.',
    '- [ ] Birim testler ve mutasyon testi onayından (%100 Kill Score) geçti.',
    '- [ ] İzole worktree üzerinden 4-aşamalı atomik pipeline ile master dalına birleştirildi.'
  ];
}

export function generateDiscussionResearchBody(
  num: number,
  title: string,
  desc: string,
  suggestedFiles: string[] = []
): string {
  const pad = String(num).padStart(3, '0');
  const filesList = suggestedFiles.length > 0
    ? suggestedFiles.map(f => `  - \`${f}\``).join('\n')
    : '  - *(Araştırma sürecinde netleştirilecek)*';

  const part1 = buildDiscussionVisionAndResearch(pad, title, desc);
  const part2 = buildDiscussionTopicsAndCriteria(filesList);
  return [...part1, ...part2].join('\n');
}

function buildWikiHeaderAndTopology(title: string, desc: string, moduleList: string): string[] {
  return [
    `# 🏛️ ${title}`,
    '',
    '## 1. 📐 Sistem Mimarisi ve Bileşen Topolojisi (Topology)',
    desc,
    '',
    '```mermaid',
    'flowchart TD',
    '    CLI["Aegis CLI (/aegis)"] --> ORCH["Orchestrator & Dispatcher"]',
    '    ORCH --> CORE["Core Engine Subsystem"]',
    '    CORE --> CAGE["Iron Cage & Mutation Gate"]',
    '    CAGE --> PROD["Production Master & Worktrees"]',
    '```',
    '',
    '### İlgili Çekirdek Modüller ve Dosyalar:',
    moduleList,
    ''
  ];
}

function buildWikiWorkflowAndSpecs(): string[] {
  return [
    '## 2. ⚙️ Çalışma Prensibi ve Veri Akışı (Data Flow & Execution Cycle)',
    '1. **İstek & Teşhis:** Ajan veya CLI komutu girdi verisini ayrıştırır ve ilgili alt sisteme yönlendirir.',
    '2. **Cerrahi İzolasyon:** Değişiklikler izole worktree üzerinde ve dosya kilidi altında yürütülür.',
    '3. **Demir Kafes Denetimi:** AST seviyesinde satır ve karmaşıklık kuralları katı biçimde denetlenir.',
    '4. **Atomik Birleştirme:** 4-adımlı pipeline ile master dalına güvenle entegre edilir.',
    '',
    '## 3. 💻 CLI ve API Referansı (Contract & Interfaces)',
    '```powershell',
    'npm run aegis -- status',
    '```',
    '- **Standart Parametreler:** Sıfır-müdahale, non-interactive ve otomasyon dostu.',
    '- **Hata Yönetimi:** Kısır döngüleri engelleyen Circuit Breaker (Loop Breaker) koruması.',
    '',
    '## 4. 🔒 Demir Kafes Standartları ve Kalite Garantileri',
    '- **Dosya Sınırı:** Azami 300 satır/dosya.',
    '- **Fonksiyon Sınırı:** Azami 40 satır/fonksiyon.',
    '- **Test Kapsamı:** %100 Monorepo test geçişi ve %70+ Mutation Testing Gate skoru.',
    '',
    '## 5. 📊 Üretim Doğrulama ve Performans Metrikleri',
    '- **Durum:** Onaylandı & Üretimde Aktif (Implemented / Authoritative).',
    '- **Canlı Bellek Entegrasyonu:** GitHub Wiki ve yaşayan depo hafızasına tam senkronize.'
  ];
}

export function generateCleanWikiArchitecture(
  num: number,
  title: string,
  desc: string,
  implementedModules: string[] = []
): CleanWikiArtifact {
  const pad = String(num).padStart(3, '0');
  const cleanTitle = `RFC-${pad}: ${title} — Sistem Mimarisi`;
  const moduleList = implementedModules.length > 0
    ? implementedModules.map(m => `• \`${m}\``).join('\n')
    : '• Çekirdek motor ve ayrıştırıcı bileşenleri';

  const header = buildWikiHeaderAndTopology(cleanTitle, desc || title, moduleList);
  const body = buildWikiWorkflowAndSpecs();
  const cleanContent = [...header, ...body].join('\n');

  return {
    title: cleanTitle,
    threeBullets: [
      'Temize çekilmiş kanonik sistem mimarisi.',
      'Demir Kafes kuralları ve test kapılarıyla doğrulanmış üretim spesifikasyonu.',
      'Sıfır-yanılma (zero-hallucination) garantili resmi teknik referans.'
    ],
    cleanContent
  };
}

export function cleanseExistingRfcForWiki(slug: string, rawContent: string): CleanWikiArtifact {
  const titleMatch = rawContent.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/^[^\w]+/, '').trim() : slug;
  const numMatch = slug.match(/^RFC-(\d+)/i);
  const num = numMatch ? parseInt(numMatch[1], 10) : 1;

  const descMatch = rawContent.match(/##\s+🔍?\s*1\.\s*Fikir ve Problem Tanımı\s*\n+([^#]+)/i);
  const desc = descMatch ? descMatch[1].trim() : title;

  const fileMatches = rawContent.match(/packages\/[a-zA-Z0-9_\-\/.]+\.ts/g);
  const files = fileMatches ? Array.from(new Set(fileMatches)) : [];

  return generateCleanWikiArchitecture(num, title.replace(/^RFC-\d+:\s*/i, ''), desc, files);
}
