# Component Interface Contracts

No new API endpoints. All changes are frontend component modifications.

## AnnotationCanvas Changes

```typescript
// No interface changes — same props, mobile-responsive internal layout
interface AnnotationCanvasProps {
  imageDataUrl: string;
  onSave: (annotatedDataUrl: string) => void;
  onCancel: () => void;
}
```

## LivePreview Changes

```typescript
// No prop interface changes — fullscreen is internal state
// New internal state:
// - isFullscreen: boolean — toggles fullscreen overlay
// - Desktop scale clamped to minimum 0.35 floor
```

## PreviewOverlay Changes

```typescript
// No prop interface changes
// New UI: fullscreen toggle button added to toolbar
```
