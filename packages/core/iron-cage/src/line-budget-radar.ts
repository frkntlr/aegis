export type DecompositionPattern =
  | 'FACADE_DELEGATION'
  | 'POP_INTERFACE'
  | 'GUARD_CLAUSE_FLATTEN'
  | 'EXTRACT_METHOD';

export interface DecompositionAdvice {
  pattern: DecompositionPattern;
  title: string;
  explanation: string;
  recommendedAction: string;
}

export interface LineBudgetAnalysis {
  filePath: string;
  fileLines: number;
  maxFileLines: number;
  fileQuotaRemaining: number;
  status: 'SAFE' | 'WARNING' | 'CRITICAL_QUOTA' | 'EXCEEDED';
  advice?: DecompositionAdvice;
  formattedReport: string;
}

export class LineBudgetRadar {
  public static readonly DEFAULT_MAX_FILE_LINES = 300;
  public static readonly DEFAULT_MAX_FUNC_LINES = 40;

  public static analyze(
    filePath: string,
    content: string,
    maxFile = LineBudgetRadar.DEFAULT_MAX_FILE_LINES,
    maxFunc = LineBudgetRadar.DEFAULT_MAX_FUNC_LINES
  ): LineBudgetAnalysis {
    const lines = content.split(/\r?\n/);
    const fileLines = lines.length;
    const fileQuota = Math.max(0, maxFile - fileLines);

    const status = LineBudgetRadar.resolveStatus(fileLines, maxFile);
    const advice = LineBudgetRadar.resolveAdvice(status, fileLines, maxFile, maxFunc);
    const formattedReport = LineBudgetRadar.buildReport(filePath, fileLines, maxFile, fileQuota, status, advice);

    return {
      filePath,
      fileLines,
      maxFileLines: maxFile,
      fileQuotaRemaining: fileQuota,
      status,
      advice,
      formattedReport
    };
  }

  private static resolveStatus(fileLines: number, maxFile: number): 'SAFE' | 'WARNING' | 'CRITICAL_QUOTA' | 'EXCEEDED' {
    if (fileLines >= maxFile) return 'EXCEEDED';
    if (fileLines >= maxFile - 20) return 'CRITICAL_QUOTA'; // 280+
    if (fileLines >= maxFile - 50) return 'WARNING';        // 250+
    return 'SAFE';
  }

  private static resolveAdvice(
    status: 'SAFE' | 'WARNING' | 'CRITICAL_QUOTA' | 'EXCEEDED',
    fileLines: number,
    maxFile: number,
    _maxFunc: number
  ): DecompositionAdvice | undefined {
    if (status === 'SAFE') return undefined;

    if (status === 'EXCEEDED' || status === 'CRITICAL_QUOTA') {
      return {
        pattern: 'FACADE_DELEGATION',
        title: 'Cephe (Facade) & Delegasyon Kalıbı',
        explanation: `Dosya ${fileLines}/${maxFile} satır kotasına ulaştı. Monolitik büyüme yerine tek sorumluluk (SRP) prensibiyle alt delege sınıfları oluşturulmalıdır.`,
        recommendedAction: 'Ana sınıfı Facade olarak koruyun; alt yardımcı operasyonları yeni bir delege sınıfına çıkarın.'
      };
    }

    return {
      pattern: 'GUARD_CLAUSE_FLATTEN',
      title: 'Guard Clause & Cerrahi Çıkarma',
      explanation: `Dosya ${fileLines}/${maxFile} satıra yaklaşıyor. Kontrol akış derinliğini 1'e indirip saf yardımcı fonksiyonlara ayrıştırın.`,
      recommendedAction: 'İç içe if/else bloklarını erken return (guard clause) ile düzleştirin.'
    };
  }

  private static buildReport(
    filePath: string,
    fileLines: number,
    maxFile: number,
    fileQuota: number,
    status: 'SAFE' | 'WARNING' | 'CRITICAL_QUOTA' | 'EXCEEDED',
    advice?: DecompositionAdvice
  ): string {
    const icon = status === 'SAFE' ? '✅' : status === 'WARNING' ? '⚠️' : '🛑';
    const lines = [
      `📏 Demir Kafes Line Budget Radar [${icon} ${status}]:`,
      ` • Dosya:      ${filePath}`,
      ` • Satır:      ${fileLines} / ${maxFile} (Kalan Kota: ${fileQuota} satır)`
    ];

    if (advice) {
      lines.push(` • Tavsiye:    ${advice.title}`);
      lines.push(` • Açıklama:   ${advice.explanation}`);
      lines.push(` • Eylem:      ${advice.recommendedAction}`);
    }

    return lines.join('\n');
  }
}
