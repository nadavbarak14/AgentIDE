// Types for the flexible panel layout system (020-flexible-panel-layout)

export type LayoutPresetId =
  | 'equal-3col'
  | '2left-1right'
  | '1left-2right'
  | '2top-1bottom'
  | '1top-2bottom'
  | 'focus';

export type PanelId =
  | 'files'
  | 'git'
  | 'preview'
  | 'issues'
  | 'widgets'
  | 'shell'
  | `ext:${string}`;

export interface CellConfig {
  cellId: string;
  activePanelId: PanelId | null;
  stackedPanelIds: PanelId[];
}

export interface LayoutConfig {
  presetId: LayoutPresetId;
  cells: CellConfig[];
  sizes: number[];
}

export interface PresetStructure {
  orientation: 'horizontal' | 'vertical';
  children: Array<PresetStructure | 'cell'>;
  defaultSizes: number[];
}

export interface LayoutPreset {
  id: LayoutPresetId;
  label: string;
  description: string;
  slotCount: number;
  structure: PresetStructure;
}
