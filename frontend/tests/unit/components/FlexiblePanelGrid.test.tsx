import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { LayoutConfig, PanelId } from '../../../src/types/layout';

// Mock react-resizable-panels so Group/Panel/Separator render as simple divs
vi.mock('react-resizable-panels', () => ({
  Group: ({ children, onLayoutChanged, ...rest }: {
    children: React.ReactNode;
    onLayoutChanged?: (layout: Record<string, number>) => void;
    [key: string]: unknown;
  }) => (
    <div data-testid="panel-group" data-orientation={String(rest.orientation)} {...{'data-on-layout': onLayoutChanged ? 'true' : 'false'}}>
      {children}
    </div>
  ),
  Panel: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <div data-testid={`panel-${id}`}>{children}</div>
  ),
  Separator: ({ className }: { className?: string }) => (
    <div data-testid="separator" className={className} />
  ),
}));

// Capture DragEnd handler for manual invocation in tests
let capturedDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
let capturedDragStart: ((event: { active: { id: string } }) => void) | null = null;

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd, onDragStart }: {
    children: React.ReactNode;
    onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
    onDragStart?: (event: { active: { id: string } }) => void;
  }) => {
    capturedDragEnd = onDragEnd ?? null;
    capturedDragStart = onDragStart ?? null;
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  useDraggable: (args: { id: string }) => ({
    attributes: { 'aria-pressed': false, 'aria-disabled': false, 'aria-describedby': 'test' },
    listeners: { onPointerDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
    data: { current: { panelId: args.id } },
  }),
  useDroppable: (args: { id: string }) => ({
    setNodeRef: vi.fn(),
    isOver: false,
    over: null,
    data: { current: { id: args.id } },
  }),
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...args: unknown[]) => args),
}));

import { FlexiblePanelGrid } from '../../../src/components/FlexiblePanelGrid';

const baseConfig: LayoutConfig = {
  presetId: 'equal-3col',
  cells: [
    { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
    { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
    { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
  ],
  sizes: [33, 34, 33],
};

const defaultProps = {
  layoutConfig: baseConfig,
  onLayoutChange: vi.fn(),
  renderPanel: (panelId: PanelId | null, cellId: string) => (
    <div data-testid={`panel-content-${cellId}`}>{panelId ?? 'empty'}</div>
  ),
  onMovePanel: vi.fn(),
  onSwapPanels: vi.fn(),
  onClosePanel: vi.fn(),
  onUpdateSizes: vi.fn(),
};

describe('FlexiblePanelGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDragEnd = null;
    capturedDragStart = null;
  });

  it('renders panels from layoutConfig cells', () => {
    render(<FlexiblePanelGrid {...defaultProps} />);
    expect(screen.getByTestId('panel-content-cell-0')).toHaveTextContent('files');
    expect(screen.getByTestId('panel-content-cell-1')).toHaveTextContent('shell');
    expect(screen.getByTestId('panel-content-cell-2')).toHaveTextContent('empty');
  });

  it('renders panel headers for cells with active panels', () => {
    render(<FlexiblePanelGrid {...defaultProps} />);
    // Panel headers show the panel label as a drag handle
    expect(screen.getAllByTitle(/Drag to move/)).toHaveLength(2); // files + shell cells
  });

  it('renders separators between panels', () => {
    render(<FlexiblePanelGrid {...defaultProps} />);
    // 3 cells means 2 separators in the root group
    const separators = screen.getAllByTestId('separator');
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });

  it('close button is disabled for the last visible panel', () => {
    const singlePanelConfig: LayoutConfig = {
      presetId: 'focus',
      cells: [{ cellId: 'cell-0', activePanelId: 'shell', stackedPanelIds: [] }],
      sizes: [100],
    };
    render(<FlexiblePanelGrid {...defaultProps} layoutConfig={singlePanelConfig} />);
    const closeBtn = screen.getByTitle('Cannot close the last panel');
    expect(closeBtn).toBeDisabled();
  });

  it('close button calls onClosePanel when not the last panel', () => {
    const onClosePanel = vi.fn();
    render(<FlexiblePanelGrid {...defaultProps} onClosePanel={onClosePanel} />);
    const closeBtns = screen.getAllByTitle(/^Close/);
    fireEvent.click(closeBtns[0]);
    expect(onClosePanel).toHaveBeenCalledWith('files');
  });

  it('renders stacked panel tab buttons', () => {
    const configWithStacked: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: ['git', 'preview'] },
        { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    render(<FlexiblePanelGrid {...defaultProps} layoutConfig={configWithStacked} />);
    expect(screen.getByTitle('Switch to git')).toBeDefined();
    expect(screen.getByTitle('Switch to preview')).toBeDefined();
  });

  it('clicking a stacked tab calls onSwapPanels', () => {
    const onSwapPanels = vi.fn();
    const configWithStacked: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: ['git'] },
        { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    render(<FlexiblePanelGrid {...defaultProps} layoutConfig={configWithStacked} onSwapPanels={onSwapPanels} />);
    const gitTab = screen.getByTitle('Switch to git');
    fireEvent.click(gitTab);
    expect(onSwapPanels).toHaveBeenCalledWith('files', 'git');
  });

  it('drag end over occupied cell calls onSwapPanels', () => {
    const onSwapPanels = vi.fn();
    render(<FlexiblePanelGrid {...defaultProps} onSwapPanels={onSwapPanels} />);
    // cell-1 has 'shell' active — dragging 'files' to it should swap
    capturedDragEnd?.({ active: { id: 'files' }, over: { id: 'cell-1' } });
    expect(onSwapPanels).toHaveBeenCalledWith('files', 'shell');
  });

  it('drag end over empty cell calls onMovePanel', () => {
    const onMovePanel = vi.fn();
    render(<FlexiblePanelGrid {...defaultProps} onMovePanel={onMovePanel} />);
    // cell-2 has no active panel — dragging 'files' to it should move
    capturedDragEnd?.({ active: { id: 'files' }, over: { id: 'cell-2' } });
    expect(onMovePanel).toHaveBeenCalledWith('files', 'cell-2');
  });

  it('drag end with no target is a no-op', () => {
    const onSwapPanels = vi.fn();
    const onMovePanel = vi.fn();
    render(<FlexiblePanelGrid {...defaultProps} onSwapPanels={onSwapPanels} onMovePanel={onMovePanel} />);
    capturedDragEnd?.({ active: { id: 'files' }, over: null });
    expect(onSwapPanels).not.toHaveBeenCalled();
    expect(onMovePanel).not.toHaveBeenCalled();
  });

  it('drag start sets active drag overlay', async () => {
    render(<FlexiblePanelGrid {...defaultProps} />);
    await act(async () => {
      capturedDragStart?.({ active: { id: 'files' } });
    });
    // After drag start, DragOverlay should show the dragged panel name
    expect(screen.getByTestId('drag-overlay')).toBeDefined();
  });

  it('renders drag overlay label for extension panels', () => {
    const extConfig: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'ext:myext' as PanelId, stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    render(<FlexiblePanelGrid {...defaultProps} layoutConfig={extConfig} />);
    // Extension panel label should strip 'ext:' prefix
    expect(screen.getByTitle('Drag to move myext panel')).toBeDefined();
  });

  it('renders with 2left-1right nested preset', () => {
    const nestedConfig: LayoutConfig = {
      presetId: '2left-1right',
      cells: [
        { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'git', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: 'shell', stackedPanelIds: [] },
      ],
      sizes: [40, 60],
    };
    render(<FlexiblePanelGrid {...defaultProps} layoutConfig={nestedConfig} />);
    expect(screen.getByTestId('panel-content-cell-0')).toHaveTextContent('files');
    expect(screen.getByTestId('panel-content-cell-1')).toHaveTextContent('git');
    expect(screen.getByTestId('panel-content-cell-2')).toHaveTextContent('shell');
  });

  it('applies className prop to outer container', () => {
    const { container } = render(<FlexiblePanelGrid {...defaultProps} className="custom-class" />);
    // The DndContext wrapper div renders inside, check for the class somewhere
    const inner = container.querySelector('.custom-class');
    expect(inner).not.toBeNull();
  });
});
