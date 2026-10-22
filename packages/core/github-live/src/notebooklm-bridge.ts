import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ParsedRfc } from './rfc-triager.js';

export interface ResearchNoteResult {
  filePath: string;
  markdownContent: string;
}

export class NotebookLmBridge {
  private researchDir: string;

  constructor(customDir?: string) {
    this.researchDir = customDir ?? path.resolve(process.cwd(), '.aegis', 'research');
  }

  public exportRfcResearchNote(rfc: ParsedRfc): ResearchNoteResult {
    fs.mkdirSync(this.researchDir, { recursive: true });
    const slug = rfc.targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const filePath = path.resolve(this.researchDir, `rfc-${slug}-research.md`);

    const lines = [
      `# 📚 NotebookLM Research Note: ${rfc.targetName} (${rfc.category.toUpperCase()})`,
      '',
      `## 1. RFC Overview`,
      `* **Title:** ${rfc.title}`,
      `* **Category:** ${rfc.category}`,
      `* **Target Files:** ${rfc.proposedFiles.join(', ')}`,
      '',
      `## 2. Architectural Rationale`,
      rfc.rationale,
      '',
      `## 3. Implementation Guidelines & Demir Kafes Constraints`,
      `- Extensibility: Implement standard ${rfc.category === 'language' ? 'LanguageExtractor' : 'IdeAdapter'} interface.`,
      '- Modularity: Standalone class and unit test only. Zero modification to core dispatcher.',
      '- Limits: Max 40 lines per function, max 300 lines per file.',
      '- Verification: Token savings >= 50%, 100% test pass.',
      '',
      `*Generated automatically by Aegis Knowledge Sync on ${new Date().toISOString()}*`
    ];

    const markdownContent = lines.join('\n');
    fs.writeFileSync(filePath, markdownContent, 'utf8');
    return { filePath, markdownContent };
  }

  public exportArchitectureSource(): ResearchNoteResult {
    const filePath = path.resolve(this.researchDir, '1-system-architecture.md');
    const content = [
      '# 🏛️ Aegis Mimari Spesifikasyonu: Çoklu Editör & Ajan İzolasyonu',
      '',
      '## 1. Temel Prensipler',
      '- **Mulgravity & Paralel Editörler:** Google Antigravity, Cursor AI, VS Code eşzamanlı çalışır.',
      '- **İzole Worktree Yapısı:** Her ajan (`alice`, `bob`, `contributor`) fiziksel izole `experimental/<agent>` worktree alanında geliştirme yapar.',
      '- **Cerrahi AST İskeletleme:** Fonksiyon gövdeleri çıkartılarak ~%82 token tasarrufu sağlanır.',
      '- **Deterministik Demir Kafes:** Maks. 40 satır/fonksiyon, maks. 300 satır/dosya statik sınırları.',
      '- **Sıfır-Token UI Testi:** BoundingBox geometrik çakışma tespiti ile LLM vision token maliyeti sıfıra indirilir.'
    ].join('\n');
    fs.mkdirSync(this.researchDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath, markdownContent: content };
  }

  public exportWorkflowSource(): ResearchNoteResult {
    const filePath = path.resolve(this.researchDir, '2-workflow-and-dispatch.md');
    const content = [
      '# ⚙️ Aegis İş Akışı: Otonom Görev Dağıtımı ve Kilit Protokolü',
      '',
      '## 1. Görev Yaşam Döngüsü',
      '1. **Ready:** GitHub Projects üzerinde acceptance criteria tanımlı görevler bekler.',
      '2. **In Progress:** Ajan boştayken (`idle`) görevi talep eder, hedef dosya kilitlerini rezerve eder.',
      '3. **Review:** PR açıldığında veya yerel TDD testleri doğrulandığında incelemeye alınır.',
      '4. **Done:** 4 adımlı atomik merge pipeline (Test -> Rebase -> Merge -> Sibling Sync) ile master\'a entegre edilir.',
      '',
      '## 2. Çakışmasız Dosya Kilitleri (Conflict-Free Locking)',
      '- Hedef dosyalar `lock:<path>` etiketiyle kilitlenir.',
      '- İki ajan aynı dosyayı asla eşzamanlı değiştiremez.'
    ].join('\n');
    fs.mkdirSync(this.researchDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath, markdownContent: content };
  }

  public exportErrorSolutionsSource(): ResearchNoteResult {
    const filePath = path.resolve(this.researchDir, '3-error-solutions.md');
    const content = [
      '# 🛠️ Aegis Hata Çözümleri & Loop Breaker Protokolü',
      '',
      '## 1. Bileşik Hata Önleme (Compounding Error Checker)',
      '- **Runaway Diff:** Her iterasyonda diff büyümesi izlenir; ani şişmeler abort edilir.',
      '- **Cascading Regressions:** Daha önce geçen testlerin kırılması durumunda derhal durdurulur.',
      '',
      '## 2. Loop Breaker (Kısır Döngü Kırıcı)',
      '- Bir görev art arda 3 kez hata verirse `status:blocked` durumuna taşınır.',
      '- Dosya kilitleri serbest bırakılır ve ajan sıradaki bağımsız göreve yönlendirilir.',
      '- GitHub issue üzerine teşhis raporu otomatik yorumlanır.'
    ].join('\n');
    fs.mkdirSync(this.researchDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath, markdownContent: content };
  }

  public exportSystemRisksSource(): ResearchNoteResult {
    const filePath = path.resolve(this.researchDir, '4-system-risks.md');
    const content = [
      '# 🛡️ Aegis Sistem Riskleri ve Güvenlik Standartları',
      '',
      '## 1. Kod Kalitesi & Demir Kafes',
      '- Spagetti ve kontrolsüz kod yazımı engellenir.',
      '- Tam dosya yeniden yazımları (full rewrite) reddedilir, yalnızca cerrahi diff kabul edilir.',
      '',
      '## 2. Mutasyon Kapısı (Mutation Gate)',
      '- Kod değişikliklerinde mutantlar üretilir ve testlerin mutantları öldürme oranı ölçülür (%70 altı engellenir).',
      '',
      '## 3. Immutable Oracle (Güven Denetçisi)',
      '- Test dosyalarının tahrif edilmesi veya boş assertions (`assert.ok(true)`) engellenir.'
    ].join('\n');
    fs.mkdirSync(this.researchDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath, markdownContent: content };
  }

  public exportAllKnowledgeSources(): ResearchNoteResult[] {
    fs.mkdirSync(this.researchDir, { recursive: true });
    const s1 = this.exportArchitectureSource();
    const s2 = this.exportWorkflowSource();
    const s3 = this.exportErrorSolutionsSource();
    const s4 = this.exportSystemRisksSource();

    const masterPath = path.resolve(this.researchDir, 'aegis-collective-knowledge.md');
    const masterContent = [
      '# 🛡️ Aegis Kolektif Sistem Bilgisi (NotebookLM Master Bundle)',
      `*Oluşturulma Zamanı: ${new Date().toISOString()}*`,
      '',
      s1.markdownContent,
      '',
      '---',
      '',
      s2.markdownContent,
      '',
      '---',
      '',
      s3.markdownContent,
      '',
      '---',
      '',
      s4.markdownContent
    ].join('\n');
    fs.writeFileSync(masterPath, masterContent, 'utf8');
    return [s1, s2, s3, s4, { filePath: masterPath, markdownContent: masterContent }];
  }

  public getResearchNote(targetName: string): string | undefined {
    const slug = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const filePath = path.resolve(this.researchDir, `rfc-${slug}-research.md`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return undefined;
  }

  public listResearchNotes(): string[] {
    if (!fs.existsSync(this.researchDir)) return [];
    return fs.readdirSync(this.researchDir).filter(f => f.endsWith('.md'));
  }
}
