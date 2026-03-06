# Data Model: Preview Device Presets & Layout Persistence

**Feature**: 025-preview-device-presets
**Date**: 2026-03-06

## Entities

### DevicePreset (Static / Read-Only)

| Field    | Type   | Description                          |
|----------|--------|--------------------------------------|
| id       | string | Unique identifier (e.g., 'iphone-15-pro') |
| name     | string | Display name (e.g., 'iPhone 15 Pro') |
| category | enum   | 'phone' or 'tablet'                 |
| width    | number | CSS pixel width                      |
| height   | number | CSS pixel height                     |

**Preset Data**:

| ID                  | Name                | Category | Width | Height |
|---------------------|---------------------|----------|-------|--------|
| iphone-se           | iPhone SE           | phone    | 375   | 667    |
| iphone-14           | iPhone 14           | phone    | 390   | 844    |
| iphone-15-pro       | iPhone 15 Pro       | phone    | 393   | 852    |
| iphone-16-pro-max   | iPhone 16 Pro Max   | phone    | 440   | 956    |
| galaxy-s24          | Samsung Galaxy S24  | phone    | 360   | 780    |
| pixel-8             | Google Pixel 8      | phone    | 412   | 915    |
| ipad-mini           | iPad Mini           | tablet   | 768   | 1024   |
| ipad-air            | iPad Air            | tablet   | 820   | 1180   |
| ipad-pro-11         | iPad Pro 11"        | tablet   | 834   | 1194   |
| ipad-pro-13         | iPad Pro 12.9"      | tablet   | 1024  | 1366   |
| galaxy-tab-s9       | Galaxy Tab S9       | tablet   | 800   | 1280   |

**Storage**: Static constant in frontend code. Not stored in database.

### PanelState (Existing - Modified)

Existing `panel_states` table. One new column added:

| Field           | Type        | Default | Description                              |
|-----------------|-------------|---------|------------------------------------------|
| mobile_device_id | TEXT (nullable) | NULL | ID of selected device preset when in mobile mode |

All other existing fields remain unchanged:
- `terminal_position` TEXT ('center'/'bottom') - already persisted
- `bottom_height_percent` INTEGER (default 40) - already persisted
- `preview_viewport` TEXT ('desktop'/'mobile'/'custom') - already persisted
- `custom_viewport_width` INTEGER (nullable) - already persisted
- `custom_viewport_height` INTEGER (nullable) - already persisted

## Relationships

- `PanelState.mobile_device_id` references a `DevicePreset.id` (soft reference, not FK)
- If `mobile_device_id` references a preset that no longer exists, fallback to first phone preset
- `mobile_device_id` is only meaningful when `preview_viewport = 'mobile'`

## State Transitions

### Viewport Mode Transitions

```
desktop ──[click mobile btn]──→ mobile (show device dropdown)
desktop ──[click custom btn]──→ custom

mobile  ──[click desktop btn]──→ desktop
mobile  ──[select device]──→ mobile (update mobile_device_id)

custom  ──[click desktop btn]──→ desktop
custom  ──[click mobile btn]──→ mobile (show device dropdown)
```

### Screenshot/Recording Dropdown States

```
closed ──[click camera btn]──→ screenshot dropdown open
closed ──[click record btn]──→ recording dropdown open (if not recording)
closed ──[click record btn]──→ recording stops (if recording)

screenshot dropdown open ──[select View]──→ capture viewport screenshot → closed
screenshot dropdown open ──[select Full]──→ capture full page screenshot → closed
screenshot dropdown open ──[click outside / Escape]──→ closed

recording dropdown open ──[select View]──→ start viewport recording → closed
recording dropdown open ──[select Full]──→ start full page recording → closed
recording dropdown open ──[click outside / Escape]──→ closed
```
