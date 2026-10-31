# 🏛️ RFC-038: RFC-011: Godot 4 UI Teamwork Scaffolding, Static Linter, and Mutual Exclusion Lock Allocation
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-038 | **Durum:** Approved (Onaylandı) ✅ | **Tarih:** 2026-10-31

## 🔍 1. Fikir ve Problem Tanımı
Architectural enhancement integrating GodotUiLinter, GodotUiScaffolder, expanded ClassDB UI ontology, and intelligent UI scene/script file routing for ui-specialist subagents.

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)
1. **Core Controller:** Durum yönetimi ve ana mantık akışı.
2. **Event Bus & Sinyaller:** Bileşenler arası gevşek bağlılık.
3. **UI / HUD Katmanı:** Görsel geri bildirim.

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon.

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [ ] Çekirdek mantık ve veri modeli tasarımı tamamlandı.
- [ ] Demir Kafes (300 satır / 40 satır) AST doğrulaması sağlandı.
- [ ] Birim testler ve mutasyon testi onayından (%100 Kill Score) geçti.