# Aegis'i kur ve kullan

## 1. Hazırlık

Node.js 20 veya üzeri, npm ve Git kurulu olmalı. Kullanacağın Codex veya
Antigravity uygulamasını açıp kendi hesabınla giriş yap. Aegis kurulumu bu
uygulamaları, hesapları veya model erişimini kurmaz.

Aegis motorunu projenin dışında kalıcı bir dizinde tut; istemci ayarları bu
dizindeki CLI dosyasını kullanır. Proje dizini önceden var olmalı ve bir Git,
Node.js veya Godot projesi olmalı.

## 2. Tek komutla kurulum

```bash
git clone https://github.com/frkntlr/aegis.git
cd aegis
npm run setup -- --client=both --project="/projenin/tam/yolu" --user
```

PowerShell'de son komut örneği:

```powershell
npm run setup -- --client=both --project="C:\Projeler\oyunum" --user
```

| Seçenek | Anlamı |
| --- | --- |
| `--client=codex` | Yalnızca Codex entegrasyonu |
| `--client=antigravity` | Yalnızca Antigravity entegrasyonu |
| `--client=both` | İki istemciyi aynı proje için hazırla |
| `--project="..."` | Entegrasyonu kuracağın mevcut proje |
| `--user` | Terminal CLI komutları; Codex seçiliyse kullanıcı becerisi de |
| `--dry-run` | Yapılacakları göster; kurulum yapma |

Kurucu bağımlılıkları yükler, derler ve seçilen istemcileri yapılandırır. Mevcut
diğer istemci/MCP ayarlarını korur. Kurulumda bildirilen dosya yollarını kontrol
et; Codex/Antigravity oturumunu ve terminalini yeniden aç.

Codex proje entegrasyonu `.codex/config.toml`, `AGENTS.md` ve
`.agents/skills/aegis/` kullanır. İstemcinin proje güveni ve MCP izinlerini kendi
arayüzünden onaylaman gerekebilir; kurucu bunları atlamaz. İlgili resmî kavramlar
[OpenAI özelleştirme rehberinde](https://learn.chatgpt.com/docs/customization/overview)
açıklanır. Antigravity için kurucu proje içindeki entegrasyon yollarını raporlar.

## 3. İlk kullanım

Proje terminalinde:

```bash
aegis status
aegis help tw
```

Codex veya Antigravity sohbetinde:

```text
aegis tw Envanter modülünü incele, bağımsız işleri paralel dağıt ve testlerle doğrula.
```

Codex'te beceriyi açıkça seçmek için `$aegis tw ...` kullanabilirsin.
Planlama CLI'sı tek başına ajan başlatmaz; sohbet içindeki koordinatör istemcinin
yerel ajan araçlarını kullanır. Gerçek eşzamanlılık istemcinin kapasitesine bağlıdır.
`aegis tw` yalnızca durum gösterir; iş başlatmak için hedefini ekle.

GitHub isteğe bağlıdır. Kullanacağın hesabın depo erişimini kendi ortamında
yapılandır; token veya parolayı AI sohbetine yapıştırma. Issue, wiki ve kanıtlı
kapanış akışı için [GitHub entegrasyon rehberini](teamwork-github-evidence-flow.md)
kullan. Commit/push istediğinde hedef dalı ve yayınlama isteğini göreve ekle.

## 4. AI'a kurdurmak için kopyala

Aşağıdaki metinde proje yolunu ve kullanacağın istemciyi değiştirip AI'a gönder:

```text
https://github.com/frkntlr/aegis deposundaki Aegis'i bu bilgisayara kur.
Hedef projem: C:\Projeler\oyunum
İstemciler: Codex ve Antigravity.
Önce README.md ve docs/getting-started.md dosyalarını oku.
Motoru proje dışındaki kalıcı bir dizine klonla; varsa mevcut motoru kullan.
Node.js, npm ve Git'i kontrol et. npm run setup -- --client=both
--project="C:\Projeler\oyunum" --user komutunu tek satır olarak çalıştır.
Mevcut proje ve MCP ayarlarımı koru. Hataları başarı gibi raporlama.
aegis status ile kontrol et; hangi uygulamayı yeniden açmam gerektiğini söyle.
Hesap girişlerini ben yapacağım. Projemi commit/push etme.
```

## 5. Tek komutla güncelleme

```bash
aegis update --pull
```

Bu komut motor kaynağını günceller, bağımlılıkları/derlemeyi hazırlar ve istemci
entegrasyonlarını yeniler. Ardından istemciyi/MCP bağlantısını yeniden başlat.
İşlem hatası varsa tamamlandı sayılmaz. Motor deposunda yerel değişikliklerin
varsa önce commit et veya kendi seçtiğin şekilde sakla; güncelleyici bunları silmez.

Bu bir zamanlanmış arka plan servisi değildir; güncelleme komutunu sen veya AI
başlatır. AI'a “Aegis'i `aegis update --pull` ile güncelle ve sonucu doğrula”
demen yeterlidir. Motor dizinini taşıdıysan kurulum komutunu yeniden çalıştır.

## Sorun giderme

`aegis` bulunamıyorsa yeni terminal aç, kurucunun gösterdiği bin dizininin
`PATH` içinde olduğunu kontrol et. Motor dizininden her zaman
`npm run aegis -- status` çalıştırabilirsin.

Codex MCP kurulumu için [ayrıntılı rehbere](codex-compatibility.md) bak.
Kurulumda `--dry-run` kullanarak hedefleri inceleyebilirsin. Test veya derleme
hatasını gizleyerek devam etme; hata çıktısını AI'a ver.
