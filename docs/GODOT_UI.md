# 🎮 Godot 4 Modern UI Architecture & Engineering Protocol

This guide establishes the authoritative architecture, quality gates, and toolchain integration for Godot 4.x UI development (Godot 4.3 through 4.7+) within Aegis.

---

## 1. Core Principles (Demir Kafes for UI)

All Godot UI scenes, themes, and GDScript presentation controllers in Aegis projects must adhere to 5 non-negotiable architectural invariants:

1. **Container-First Layout**: Always nest interactive elements within responsive containers (`MarginContainer`, `PanelContainer`, `VBoxContainer`, `HBoxContainer`, `GridContainer`, `ScrollContainer`, `TabContainer`, `AspectRatioContainer`). Never specify manual pixel coordinates (`position`, `offset_*`) on container children.
2. **Responsive Root Anchors**: Fullscreen roots (`Control`, `CanvasLayer`) must define `anchors_preset = 15` (Full Rect) with `grow_horizontal = 2, grow_vertical = 2`.
3. **Accessible Touch Targets**: Buttons, checkboxes, and sliders must satisfy a minimum touch target size of 44x44px (`custom_minimum_size = Vector2(44, 44)`).
4. **Decoupled Controllers**: GDScript UI controllers must extend `Control` or `CanvasLayer`, query nodes via unique names (`%NodeName`), and emit typed signals rather than directly mutating domain business models.
5. **Pre-PR Quality Gate**: Every `.tscn` scene must pass static linter audit (`aegis godot ui:lint`) with a 100/100 score prior to merge.

---

## 2. Godot 4.3 – 4.7+ UI Advancements

Recent Godot 4 releases introduced foundational UI upgrades integrated into the Aegis engine:

- **AccessKit & Screen Reader Support (Godot 4.5+)**:
  Native OS screen reader bindings (Narrator, VoiceOver, Orca). `Control` nodes support `accessibility_name`, `accessibility_description`, and accessibility roles.
- **Bi-Directional RTL/LTR & Auto-Translate (Godot 4.3+)**:
  `auto_translate_mode` and `layout_direction` enable seamless dynamic localization without requiring editor or game restarts.
- **Typed Dictionaries & Inspector UX (Godot 4.4+)**:
  Strongly typed dictionaries for UI configuration state, themes, and inventory slot payloads.
- **Theme Variations & Fallbacks**:
  `theme_type_variation` enables contextual component styling (e.g. `AccentButton`, `DangerButton`) without separate `.tres` files.

---

## 3. UI Scaffolding Engine

Aegis provides instantaneous, production-ready UI scaffolding conforming to Demir Kafes rules:

```bash
aegis godot ui:scaffold <type> <name> [outDir]
```

Supported Scaffolding Types:
- `menu`: Fullscreen start menu with background, title, Start/Options/Exit buttons, and typed signals.
- `hud`: Screen-anchored CanvasLayer HUD with Health ProgressBar and Score display.
- `dialog`: Modal confirmation dialog with backdrop dimmer, Title, Message, and Confirm/Cancel actions.
- `settings`: TabContainer with Audio sliders, Video toggles, and AccessKit Accessibility screen reader controls.
- `inventory`: GridContainer-based responsive inventory with dynamic slots and item selection events.
- `theme`: Multi-state StyleBoxFlat Theme (`normal`, `hover`, `pressed`, `disabled`, `focus`).

---

## 4. Static UI Linter (`aegis godot ui:lint`)

The Aegis UI Linter evaluates `.tscn` AST hierarchies against structural heuristics:

| Rule Code | Severity | Description | Fix Suggestion |
| :--- | :---: | :--- | :--- |
| `ROOT_CONTROL_RESPONSIVENESS` | Warning | Root Control missing `anchors_preset` | Set `anchors_preset = 15` & `grow_* = 2` |
| `CONTAINER_CHILD_CONFLICT` | Warning | Container child has manual `position` / offsets | Remove manual coordinates; use `size_flags` |
| `CONTAINER_LAYOUT_MODE` | Warning | Container child specifies manual layout mode | Use `layout_mode = 2` (Container Sizing) |
| `TOUCH_TARGET_SIZE` | Warning | Button touch target smaller than 44x44px | Increase `custom_minimum_size` to >= 44x44 |
| `ACCESSIBILITY_METADATA` | Info | Interactive control lacks text or tooltip | Add `tooltip_text` or `accessibility_name` |
| `SCROLL_CONTAINER_SIZING` | Info | ScrollContainer lacks expand size flags | Set `size_flags_vertical = 3` (Expand/Fill) |
| `DANGLING_SIGNAL_NODE` | Error | Signal connected to non-existent node | Verify connection path matches scene tree |
| `SCRIPT_METHOD_MISSING` | Error | Connected target method not in GDScript | Implement `func method():` in script |

---

## 5. Multi-Aspect Telemetry Verification

Aegis verifies zero-token layout integrity across 9 target aspect ratios:

```text
[16:9]   1920x1080 (Desktop / Console standard)
[21:9]   2560x1080 (Ultrawide monitors)
[16:10]  1920x1200 (Steam Deck & Laptops)
[4:3]    1440x1080 (iPad & Retro displays)
[9:16]   1080x1920 (Mobile portrait)
[9:18]   1080x2160 (Android portrait)
[9:19.5] 1080x2340 (Modern iPhone notch / Dynamic Island)
[9:20]   1080x2400 (Tall Android displays)
[3:4]    1080x1440 (Foldable devices)
```

Run verification with:
```bash
aegis godot inspect [projectDir]
```

---

## 6. Headless Verification in CI

```bash
# Verify GDScript syntax without launching window
godot --headless --check-only --script res://test/smoke_test.gd

# Run automated playtest harness
aegis godot playtest [scenario.json]
```
