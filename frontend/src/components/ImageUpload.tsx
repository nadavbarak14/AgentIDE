import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadedImages } from '../services/api';

interface UploadedImage {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  status: string;
  createdAt: string;
}

interface ImageUploadProps {
  sessionId: string;
  onImageUploaded?: (image: { id: string; originalFilename: string; storedPath: string }) => void;
}

export function ImageUpload({ sessionId, onImageUploaded }: ImageUploadProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliverMessage, setDeliverMessage] = useState<Record<string, string>>({});
  const [deliveringIds, setDeliveringIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing images on mount
  useEffect(() => {
    uploadedImages.list(sessionId).then(setImages).catch(() => {});
  }, [sessionId]);

  // Clear error timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setError(null), 4000);
  }, []);

  const isValidImageFile = useCallback((file: File): boolean => {
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
    return validTypes.includes(file.type);
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    if (!isValidImageFile(file)) {
      showError(`Invalid file type: ${file.type || 'unknown'}. Use PNG, JPEG, GIF, WebP, SVG, or BMP.`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const result = await uploadedImages.upload(sessionId, file);
      // Refresh the list to get the full image object
      const updated = await uploadedImages.list(sessionId);
      setImages(updated);
      onImageUploaded?.({
        id: result.id,
        originalFilename: result.originalFilename,
        storedPath: result.storedPath,
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [sessionId, isValidImageFile, showError, onImageUploaded]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      showError('No image files found. Drop PNG, JPEG, GIF, WebP, SVG, or BMP files.');
      return;
    }
    // Upload first image (could extend to batch later)
    handleUpload(imageFiles[0]);
  }, [handleUpload, showError]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleUpload]);

  const handleDeliver = useCallback(async (imageId: string) => {
    setDeliveringIds((prev) => new Set(prev).add(imageId));
    try {
      const message = deliverMessage[imageId]?.trim() || undefined;
      await uploadedImages.deliver(sessionId, imageId, message);
      // Refresh list to get updated status
      const updated = await uploadedImages.list(sessionId);
      setImages(updated);
      // Clear the message input for this image
      setDeliverMessage((prev) => {
        const next = { ...prev };
        delete next[imageId];
        return next;
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to send image');
    } finally {
      setDeliveringIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  }, [sessionId, deliverMessage, showError]);

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/20 border-2 border-dashed border-blue-500 rounded-lg backdrop-blur-sm">
          <span className="text-blue-400 text-sm font-medium">Drop image here</span>
        </div>
      )}

      {/* Compact upload trigger row */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded transition-colors disabled:opacity-50"
          title="Upload image"
        >
          <span className="text-sm leading-none" aria-hidden="true">&#x1F4CE;</span>
          <span>Image</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading && (
          <div className="flex items-center gap-1 text-xs text-blue-400">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Uploading...</span>
          </div>
        )}

        {images.length > 0 && (
          <span className="text-xs text-gray-500 ml-auto">
            {images.length} image{images.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-2 mb-1 px-2 py-1 text-xs text-red-400 bg-red-900/30 border border-red-800 rounded flex items-center gap-1">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300 flex-shrink-0">
            ×
          </button>
        </div>
      )}

      {/* Image list */}
      {images.length > 0 && (
        <div className="px-2 pb-1.5 space-y-1 max-h-[160px] overflow-y-auto">
          {images.map((img) => (
            <div
              key={img.id}
              className="flex items-center gap-2 px-1.5 py-1 bg-gray-900/50 border border-gray-700 rounded text-xs group"
            >
              {/* Thumbnail */}
              <img
                src={uploadedImages.getFileUrl(sessionId, img.id)}
                alt={img.originalFilename}
                className="w-8 h-8 object-cover rounded border border-gray-600 flex-shrink-0 bg-gray-800"
                loading="lazy"
              />

              {/* Filename and status */}
              <div className="flex-1 min-w-0">
                <div className="truncate text-gray-300" title={img.originalFilename}>
                  {img.originalFilename}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      img.status === 'sent'
                        ? 'bg-green-500'
                        : img.status === 'pending'
                          ? 'bg-yellow-500'
                          : 'bg-gray-500'
                    }`}
                  />
                  <span className="text-gray-500">{img.status}</span>
                  {img.width && img.height && (
                    <span className="text-gray-600 ml-1">{img.width}x{img.height}</span>
                  )}
                </div>
              </div>

              {/* Send controls */}
              {img.status === 'pending' && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="text"
                    value={deliverMessage[img.id] || ''}
                    onChange={(e) =>
                      setDeliverMessage((prev) => ({ ...prev, [img.id]: e.target.value }))
                    }
                    placeholder="Note..."
                    className="w-20 px-1 py-0.5 text-xs bg-gray-800 border border-gray-600 rounded text-gray-300 placeholder-gray-600 outline-none focus:border-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDeliver(img.id);
                    }}
                  />
                  <button
                    onClick={() => handleDeliver(img.id)}
                    disabled={deliveringIds.has(img.id)}
                    className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Send to Claude"
                  >
                    {deliveringIds.has(img.id) ? '...' : 'Send'}
                  </button>
                </div>
              )}

              {img.status === 'sent' && (
                <span className="text-xs text-green-500 flex-shrink-0 px-1">Sent</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
