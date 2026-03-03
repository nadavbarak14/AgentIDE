import React, { useCallback } from 'react';
import {
  Group,
  Panel,
  Separator,
} from 'react-resizable-panels';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import type { LayoutConfig, PanelId, PresetStructure } from '../types/layout';
import { LAYOUT_PRESETS, visiblePanelCount } from '../constants/layoutPresets';

interface FlexiblePanelGridProps {
  layoutConfig: LayoutConfig;
  onLayoutChange: (newConfig: LayoutConfig) => void;
  renderPanel: (panelId: PanelId | null, cellId: string) => React.ReactNode;
  onMovePanel: (panelId: PanelId, targetCellId: string) => void;
  onSwapPanels: (panelA: PanelId, panelB: PanelId) => void;
  onClosePanel: (panelId: PanelId) => void;
  onUpdateSizes: (sizes: number[]) => void;
  className?: string;
}

interface CellProps {
  cellId: string;
  activePanelId: PanelId | null;
  stackedPanelIds: PanelId[];
  isDragging: boolean;
  isLastVisible: boolean;
  renderPanel: (panelId: PanelId | null, cellId: string) => React.ReactNode;
  onClose: (panelId: PanelId) => void;
  onSwapPanels: (panelA: PanelId, panelB: PanelId) => void;
}

function DroppableCell({ cellId, activePanelId, stackedPanelIds, isDragging, isLastVisible, renderPanel, onClose, onSwapPanels }: CellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });

  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col h-full min-h-0 ${
        isDragging && isOver ? 'ring-2 ring-blue-500 ring-inset' : ''
      }`}
    >
      {activePanelId && (
        <PanelHeader
          panelId={activePanelId}
          isLastVisible={isLastVisible}
          onClose={onClose}
        />
      )}
      <div className={`flex-1 min-h-0 ${isDragging ? 'pointer-events-none' : ''}`}>
        {renderPanel(activePanelId, cellId)}
      </div>
      {stackedPanelIds.length > 0 && (
        <div className="flex border-t border-gray-700 bg-gray-900 text-xs">
          {stackedPanelIds.map(pid => {
            const label = pid.startsWith('ext:') ? pid.slice(4) : pid;
            return (
              <button
                key={pid}
                className="px-3 py-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors capitalize"
                onClick={() => activePanelId && onSwapPanels(activePanelId, pid)}
                title={`Switch to ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PanelHeaderProps {
  panelId: PanelId;
  isLastVisible: boolean;
  onClose: (panelId: PanelId) => void;
}

function PanelHeader({ panelId, isLastVisible, onClose }: PanelHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: panelId,
    data: { panelId },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  const panelLabel = panelId.startsWith('ext:') ? panelId.slice(4) : panelId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center h-7 px-2 bg-gray-800 border-b border-gray-700 flex-shrink-0 select-none"
    >
      <div
        {...listeners}
        {...attributes}
        className="flex-1 cursor-grab active:cursor-grabbing text-xs text-gray-400 hover:text-gray-200 transition-colors capitalize"
        title={`Drag to move ${panelLabel} panel`}
      >
        {panelLabel}
      </div>
      <button
        onClick={() => !isLastVisible && onClose(panelId)}
        disabled={isLastVisible}
        className={`ml-1 w-4 h-4 flex items-center justify-center text-gray-500 rounded transition-colors ${
          isLastVisible
            ? 'opacity-30 cursor-not-allowed'
            : 'hover:text-gray-200 hover:bg-gray-700'
        }`}
        title={isLastVisible ? 'Cannot close the last panel' : `Close ${panelLabel}`}
      >
        x
      </button>
    </div>
  );
}

function buildStructureTree(
  structure: PresetStructure | 'cell',
  cells: LayoutConfig['cells'],
  cellIndex: { current: number },
  isDragging: boolean,
  visibleCount: number,
  renderPanel: (panelId: PanelId | null, cellId: string) => React.ReactNode,
  onClosePanel: (panelId: PanelId) => void,
  onSwapPanels: (panelA: PanelId, panelB: PanelId) => void,
  onUpdateSizes: (sizes: number[]) => void,
  groupId: string,
): React.ReactNode {
  if (structure === 'cell') {
    const idx = cellIndex.current++;
    const cell = cells[idx];
    if (!cell) return null;
    const isLastVisible = visibleCount === 1 && cell.activePanelId !== null;
    return (
      <DroppableCell
        key={cell.cellId}
        cellId={cell.cellId}
        activePanelId={cell.activePanelId}
        stackedPanelIds={cell.stackedPanelIds}
        isDragging={isDragging}
        isLastVisible={isLastVisible}
        renderPanel={renderPanel}
        onClose={onClosePanel}
        onSwapPanels={onSwapPanels}
      />
    );
  }

  const childNodes = structure.children.map((child, i) => {
    const childNode = buildStructureTree(
      child,
      cells,
      cellIndex,
      isDragging,
      visibleCount,
      renderPanel,
      onClosePanel,
      onSwapPanels,
      onUpdateSizes,
      `${groupId}-${i}`,
    );
    return (
      <React.Fragment key={`frag-${groupId}-${i}`}>
        {i > 0 && (
          <Separator
            className={`${
              structure.orientation === 'horizontal'
                ? 'w-1 cursor-col-resize'
                : 'h-1 cursor-row-resize'
            } bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0`}
          />
        )}
        <Panel
          id={`panel-${groupId}-${i}`}
          defaultSize={structure.defaultSizes[i] ?? 33}
          minSize={structure.orientation === 'horizontal' ? 15 : 12}
        >
          {childNode}
        </Panel>
      </React.Fragment>
    );
  });

  // Wire onLayoutChanged for the root group only — persists top-level resize sizes
  const onLayoutChanged = groupId === 'root'
    ? (layout: Record<string, number>) => {
        const sizes = structure.children.map((_, i) =>
          layout[`panel-root-${i}`] ?? structure.defaultSizes[i] ?? 0,
        );
        onUpdateSizes(sizes);
      }
    : undefined;

  return (
    <Group
      orientation={structure.orientation}
      className="h-full w-full"
      onLayoutChanged={onLayoutChanged}
    >
      {childNodes}
    </Group>
  );
}

export function FlexiblePanelGrid({
  layoutConfig,
  onMovePanel,
  onSwapPanels,
  onClosePanel,
  onUpdateSizes,
  renderPanel,
  className = '',
}: FlexiblePanelGridProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const preset = LAYOUT_PRESETS[layoutConfig.presetId];
  const vCount = visiblePanelCount(layoutConfig);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedPanelId = active.id as PanelId;
    const targetCellId = over.id as string;

    // Check if target is a cell
    const targetCell = layoutConfig.cells.find(c => c.cellId === targetCellId);
    if (targetCell) {
      if (targetCell.activePanelId) {
        onSwapPanels(draggedPanelId, targetCell.activePanelId);
      } else {
        onMovePanel(draggedPanelId, targetCellId);
      }
    }
  }, [layoutConfig, onMovePanel, onSwapPanels]);

  const cellIndex = { current: 0 };

  const treeContent = buildStructureTree(
    preset.structure,
    layoutConfig.cells,
    cellIndex,
    activeDragId !== null,
    vCount,
    renderPanel,
    onClosePanel,
    onSwapPanels,
    onUpdateSizes,
    'root',
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={`h-full w-full ${className}`}>
        {treeContent}
      </div>
      <DragOverlay>
        {activeDragId ? (
          <div className="bg-gray-800 border border-blue-500 rounded px-3 py-1 text-xs text-gray-200 shadow-lg opacity-90 capitalize">
            {activeDragId.startsWith('ext:') ? activeDragId.slice(4) : activeDragId}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
