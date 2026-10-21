# 🛡️ Aegis Güvenlik Modeli: Derinlemesine Savunma (Defense-in-Depth)

Aegis, otonom yapay zeka ajanlarının kontrolsüz hareketlerini sınırlamak için çok katmanlı bir güvenlik modeli uygular.

---

## 1. Ayrıştırılmış Doğrulama & Immutable Oracle (`@aegis/trust-verifier`)
- **Ajan Kendi Sınavını Notlandıramaz:** Ajanın *"Tüm testler geçti"* şeklindeki kendi beyanına güvenilmez.
- **Test Dosyası Tahrif Koruması:** Ajanın test dosyalarını (`*.test.ts`, `*.spec.ts`) değiştirmesi şüpheli (`SUSPICIOUS`) olarak işaretlenir ve otomatik merge durdurularak insan onayına sunulur.
- **Vacuous Assertion Tespiti:** Ajanların zor testleri geçirmek için yazdığı anlamsız testler (`expect(x).toBe(x)`) statik analizle tespit edilip reddedilir.

---

## 2. MCP Güvenlik & RBAC Katmanı (`@aegis/mcp-security`)
- **Tool-Level RBAC:** Ajanlar sadece görevleri için tanımlanmış araçları (`read_file`, `write_file`, `run_test`, `ast_skeleton`) kullanabilir.
- **Yıkıcı İşlemler Koruması (Human-in-the-Loop):** `force_push`, `drop_database`, `delete_branch` gibi yıkıcı komutlar otonom ajanlara fiziksel olarak kapatılmıştır.
- **Rate Limiting:** Ajan başına dakikada maksimum 30 çağrı sınırı uygulanır. Runaway recursive loop'lar anında dondurulur.

---

## 3. Container Sandbox & Filesystem Jail
- **Docker İzolasyonu:** Ajanlar izole Docker container'larında çalıştırılabilir (`docker-compose.agent.yml`).
- **`cap_drop: [ALL]`:** Container içindeki tüm Linux ayrıcalıkları kaldırılır.
- **`read_only: true`:** Root dosya sistemi salt okunurdur; sadece `/tmp` ve ajanın kendi `experimental/` worktree alanına yazma izni vardır.
- **İzole Port & Veritabanı:** Alice (`3000`, `aegis_test_alice`) ve Bob (`3100`, `aegis_test_bob`) için bağımsız port ve veritabanı ayrılmıştır.
