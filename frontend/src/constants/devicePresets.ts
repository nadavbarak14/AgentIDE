export type DeviceCategory = 'phone' | 'tablet';

export interface DevicePreset {
  id: string;
  name: string;
  brand: string;
  category: DeviceCategory;
  width: number;
  height: number;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  // iPhone
  { id: 'iphone-17-pro-max', name: 'iPhone 17 Pro Max', brand: 'iPhone', category: 'phone', width: 440, height: 956 },
  { id: 'iphone-17-pro', name: 'iPhone 17 Pro', brand: 'iPhone', category: 'phone', width: 402, height: 874 },
  { id: 'iphone-17-air', name: 'iPhone 17 Air', brand: 'iPhone', category: 'phone', width: 420, height: 912 },
  { id: 'iphone-17', name: 'iPhone 17', brand: 'iPhone', category: 'phone', width: 402, height: 874 },
  { id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', brand: 'iPhone', category: 'phone', width: 430, height: 932 },
  { id: 'iphone-16-pro', name: 'iPhone 16 Pro', brand: 'iPhone', category: 'phone', width: 393, height: 852 },
  { id: 'iphone-16', name: 'iPhone 16', brand: 'iPhone', category: 'phone', width: 390, height: 844 },
  { id: 'iphone-se', name: 'iPhone SE', brand: 'iPhone', category: 'phone', width: 375, height: 667 },
  // Samsung
  { id: 'galaxy-s25-ultra', name: 'Galaxy S25 Ultra', brand: 'Samsung', category: 'phone', width: 412, height: 891 },
  { id: 'galaxy-s25', name: 'Galaxy S25', brand: 'Samsung', category: 'phone', width: 360, height: 780 },
  { id: 'galaxy-z-flip6', name: 'Galaxy Z Flip6', brand: 'Samsung', category: 'phone', width: 393, height: 960 },
  // Google
  { id: 'pixel-10', name: 'Pixel 10', brand: 'Google', category: 'phone', width: 412, height: 923 },
  { id: 'pixel-9-pro', name: 'Pixel 9 Pro', brand: 'Google', category: 'phone', width: 410, height: 914 },
  // iPad
  { id: 'ipad-pro-13', name: 'iPad Pro 13"', brand: 'iPad', category: 'tablet', width: 1032, height: 1376 },
  { id: 'ipad-pro-11', name: 'iPad Pro 11"', brand: 'iPad', category: 'tablet', width: 834, height: 1210 },
  { id: 'ipad-air-13', name: 'iPad Air 13"', brand: 'iPad', category: 'tablet', width: 1024, height: 1366 },
  { id: 'ipad-air-11', name: 'iPad Air 11"', brand: 'iPad', category: 'tablet', width: 820, height: 1180 },
  { id: 'ipad-mini', name: 'iPad Mini', brand: 'iPad', category: 'tablet', width: 744, height: 1133 },
];

export function getPresetById(id: string): DevicePreset | null {
  return DEVICE_PRESETS.find((p) => p.id === id) ?? null;
}

export const PHONE_PRESETS = DEVICE_PRESETS.filter((p) => p.category === 'phone');
export const TABLET_PRESETS = DEVICE_PRESETS.filter((p) => p.category === 'tablet');

/** Get unique brand names in order */
export const BRANDS = [...new Set(DEVICE_PRESETS.map((p) => p.brand))];

/** Get presets grouped by brand */
export function getPresetsByBrand(): Record<string, DevicePreset[]> {
  const grouped: Record<string, DevicePreset[]> = {};
  for (const preset of DEVICE_PRESETS) {
    if (!grouped[preset.brand]) grouped[preset.brand] = [];
    grouped[preset.brand].push(preset);
  }
  return grouped;
}
