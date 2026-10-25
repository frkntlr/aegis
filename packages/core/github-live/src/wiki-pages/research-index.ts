import type { WikiSuitePage } from '../types.js';

export const RESEARCH_INDEX_PAGE: WikiSuitePage = {
  slug: 'Research-Index',
  title: 'Aegis Yaşayan Araştırma & Zemin Gerçeği Raporları Dizini',
  threeBullets: [
    'Google NotebookLM ile Doğrulanmış ve Alıntılanmış Derin Mimari Araştırmalar.',
    'Bağlam Kaymasını Önleyen Etkileşimli Diyalog ve Çoklu-Worktree Kilitleme Modelleri.',
    'Yaşayan Bellek Olarak GitHub Wiki Deposuyla Sürekli Senkronize Araştırma Bilgi Tabanı.'
  ],
  content: [
    '## 🔬 Aegis Yaşayan Araştırma & Zemin Gerçeği Raporları',
    '',
    'Aegis, mimari belirsizlikleri çözmek için Google NotebookLM ile yürütülen derin zemin araştırmalarını bağımsız araştırma raporları olarak doğrudan Wiki deposunda yaşatır.',
    '',
    '---',
    '',
    '### 📚 Mevcut Zemin Araştırmaları',
    '',
    '1. **[[research-interactive-dialogue-engine]]:**',
    '   - *Konu:* Interactive 3-Turn Conversational State Machine & Decision Engine.',
    '   - *Kapsam:* Semptom sınıflandırma, bağlam kayması olmaksızın 3 dönüşlü klinik diyalog ve reçete türetme kalıpları.',
    '   - *Kaynaklar:* NotebookLM doğrulanmış mimari zemin dokümanları.',
    '',
    '2. **[[research-multi-worktree-git-locking-protocols]]:**',
    '   - *Konu:* Multi-Worktree Git Locking Protocols & Mutex Strategies.',
    '   - *Kapsam:* Dağıtık ve paralel ajanların Git worktree ve dosya kilitleri üzerinden çakışmasız eşzamanlı çalışması.',
    '   - *Kaynaklar:* 3 yetkili Git ve işletim sistemi mimari kaynağı alıntıları.',
    '',
    '---',
    '',
    '### 🚀 Yeni Bir Mimari Araştırma Başlatma',
    '',
    'Ajanlar veya geliştiriciler herhangi bir teknik konuda NotebookLM zemin araştırması başlatıp doğrudan Wiki\'ye aktarabilir:',
    '```powershell',
    'npm run aegis -- nlm:research "Zero-Copy AST Memory Buffers" fast',
    '```'
  ].join('\n')
};
