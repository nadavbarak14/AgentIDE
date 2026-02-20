import { useState, useRef, useEffect, useCallback } from 'react';

interface AnnotationCanvasProps {
  imageDataUrl: string;
  onSave: (annotatedDataUrl: string) => void;
  onCancel: () => void;
}

type Tool = 'arrow' | 'rectangle' | 'freehand' | 'text';

const COLORS: { name: string; value: string }[] = [
  { name: 'Red', value: '#ef4444' }, { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' }, { name: 'Yellow', value: '#eab308' },
  { name: 'White', value: '#ffffff' },
];

const LINE_WIDTH = 3;

export function AnnotationCanvas({ imageDataUrl, onSave, onCancel }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState('#ef4444');
  const [history, setHistory] = useState<ImageData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const snapshotBeforeDraw = useRef<ImageData | null>(null);

  // Text input state
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

  // Load image onto canvas on mount
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      // Save initial state as first history entry
      setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }, []);

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setHistory((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const drawArrow = useCallback((ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const headLen = 15;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'text') {
      const pos = getCanvasPos(e);
      setTextInput({ x: pos.x, y: pos.y, value: '' });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasPos(e);
    startPos.current = pos;
    setIsDrawing(true);
    snapshotBeforeDraw.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (tool === 'freehand') {
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }, [tool, color, getCanvasPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);

    if (tool === 'freehand') {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }

    // For arrow/rectangle: restore snapshot then draw preview
    if (snapshotBeforeDraw.current) {
      ctx.putImageData(snapshotBeforeDraw.current, 0, 0);
    }
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    const from = startPos.current!;

    if (tool === 'arrow') {
      drawArrow(ctx, from, pos);
    } else if (tool === 'rectangle') {
      ctx.strokeRect(from.x, from.y, pos.x - from.x, pos.y - from.y);
    }
  }, [isDrawing, tool, color, getCanvasPos, drawArrow]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    startPos.current = null;
    snapshotBeforeDraw.current = null;
    pushHistory();
  }, [isDrawing, pushHistory]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(textInput.value, textInput.x, textInput.y);
    setTextInput(null);
    pushHistory();
  }, [textInput, color, pushHistory]);

  const handleUndo = useCallback(() => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const prev = history[history.length - 2];
    ctx.putImageData(prev, 0, 0);
    setHistory((h) => h.slice(0, -1));
  }, [history]);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  }, [onSave]);

  const getTextInputStyle = (): React.CSSProperties | undefined => {
    if (!textInput || !canvasRef.current) return undefined;
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { position: 'absolute', left: r.left + textInput.x * (r.width / c.width),
      top: r.top + textInput.y * (r.height / c.height) - 12, zIndex: 60 };
  };

  const tools: { id: Tool; label: string }[] = [
    { id: 'arrow', label: 'Arrow' }, { id: 'rectangle', label: 'Rect' },
    { id: 'freehand', label: 'Draw' }, { id: 'text', label: 'Text' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center pointer-events-auto">
      <div className="flex flex-col max-w-[90vw] max-h-[90vh]">
        {/* Toolbar */}
        <div className="bg-gray-800 border-b border-gray-700 px-3 py-2 flex items-center gap-3 rounded-t-lg">
          {/* Tools */}
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTool(t.id); setTextInput(null); }}
              className={`text-xs rounded px-2 py-1 ${
                tool === t.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-600" />

          {/* Colors */}
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                title={c.name}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  color === c.value ? 'border-white scale-125' : 'border-gray-500 hover:border-gray-300'
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          <div className="w-px h-5 bg-gray-600" />

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Undo
          </button>

          <div className="flex-1" />

          {/* Save / Cancel */}
          <button
            onClick={onCancel}
            className="text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-xs bg-blue-600 text-white hover:bg-blue-500 rounded px-2 py-1"
          >
            Save
          </button>
        </div>

        {/* Canvas area */}
        <div className="relative bg-gray-900 rounded-b-lg overflow-auto">
          <canvas
            ref={canvasRef}
            className="block max-w-full max-h-[calc(90vh-48px)] cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
      </div>

      {/* Text input overlay */}
      {textInput && (
        <input
          autoFocus
          type="text"
          value={textInput.value}
          onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTextSubmit();
            if (e.key === 'Escape') setTextInput(null);
          }}
          onBlur={handleTextSubmit}
          placeholder="Type text..."
          className="fixed px-1 py-0.5 text-sm bg-gray-900 border border-gray-500 rounded text-white outline-none focus:border-blue-500"
          style={getTextInputStyle()}
        />
      )}
    </div>
  );
}
