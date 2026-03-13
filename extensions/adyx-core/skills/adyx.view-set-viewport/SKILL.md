---
name: adyx.view-set-viewport
description: "Set the preview browser viewport mode. Arguments: mode [deviceId]. Modes: 'desktop [desktopId]' (desktop preset), 'mobile <deviceId>' (device preset). Desktop: macbook-air-13 (1470x956), macbook-pro-14 (1512x982), macbook-pro-16 (1728x1117), desktop-1080p (1920x1080), desktop-1440p (2560x1440), desktop-4k (3840x2160), desktop-1366 (1366x768), desktop-1280 (1280x720). iPhone: iphone-17-pro-max (440x956), iphone-17-pro (402x874), iphone-17-air (420x912), iphone-17 (402x874), iphone-16-pro-max (430x932), iphone-16-pro (393x852), iphone-16 (390x844), iphone-se (375x667). Samsung: galaxy-s25-ultra (412x891), galaxy-s25 (360x780), galaxy-z-flip6 (393x960). Google: pixel-10 (412x923), pixel-9-pro (410x914). iPad: ipad-pro-13 (1032x1376), ipad-pro-11 (834x1210), ipad-air-13 (1024x1366), ipad-air-11 (820x1180), ipad-mini (744x1133)."
---

# View Set Viewport

Set the preview browser viewport mode: desktop with a resolution preset, or mobile with a device preset.

## Usage

```bash
./adyx.view-set-viewport/scripts/adyx.view-set-viewport.sh <mode> [deviceId]
```

## Parameters

- `mode` (required): `desktop` or `mobile`
- `deviceId` (optional for desktop, required for mobile): One of:
  - **Laptop**: `macbook-air-13` (1470x956 / 13.6"), `macbook-pro-14` (1512x982 / 14.2"), `macbook-pro-16` (1728x1117 / 16.2")
  - **Monitor**: `desktop-1080p` (1920x1080 / 24"), `desktop-1440p` (2560x1440 / 27"), `desktop-4k` (3840x2160 / 32"), `desktop-1366` (1366x768 / 15.6"), `desktop-1280` (1280x720 / 13")
  - **iPhone**: `iphone-17-pro-max`, `iphone-17-pro`, `iphone-17-air`, `iphone-17`, `iphone-16-pro-max`, `iphone-16-pro`, `iphone-16`, `iphone-se`
  - **Samsung**: `galaxy-s25-ultra`, `galaxy-s25`, `galaxy-z-flip6`
  - **Google**: `pixel-10`, `pixel-9-pro`
  - **iPad**: `ipad-pro-13`, `ipad-pro-11`, `ipad-air-13`, `ipad-air-11`, `ipad-mini`

## Examples

```bash
# Switch to desktop mode (default 1080p)
./adyx.view-set-viewport/scripts/adyx.view-set-viewport.sh desktop

# Switch to desktop 1440p
./adyx.view-set-viewport/scripts/adyx.view-set-viewport.sh desktop desktop-1440p

# Switch to MacBook Pro 14" resolution
./adyx.view-set-viewport/scripts/adyx.view-set-viewport.sh desktop macbook-pro-14

# Switch to iPhone 17 Pro (402x874)
./adyx.view-set-viewport/scripts/adyx.view-set-viewport.sh mobile iphone-17-pro

# Switch to iPad Air 11" (820x1180)
./adyx.view-set-viewport/scripts/adyx.view-set-viewport.sh mobile ipad-air-11
```
