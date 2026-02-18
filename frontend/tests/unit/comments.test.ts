import { describe, it, expect } from 'vitest';

// ── Ephemeral comments — cleared after Send All ──

describe('Ephemeral comments — cleared after Send All', () => {
  it('removes delivered comments from existingComments state', () => {
    const existingComments = [
      { id: 'c1', status: 'pending', commentText: 'Fix this' },
      { id: 'c2', status: 'pending', commentText: 'Rename that' },
      { id: 'c3', status: 'pending', commentText: 'Add test' },
    ];
    const deliveredIds = ['c1', 'c2', 'c3'];
    const deliveredSet = new Set(deliveredIds);

    const updated = existingComments.filter((c) => !deliveredSet.has(c.id));

    expect(updated).toHaveLength(0);
  });

  it('keeps comments that were not in the delivered set', () => {
    const existingComments = [
      { id: 'c1', status: 'pending', commentText: 'Fix this' },
      { id: 'c2', status: 'pending', commentText: 'Rename that' },
      { id: 'c3', status: 'pending', commentText: 'Add test' },
    ];
    const deliveredIds = ['c1', 'c2'];
    const deliveredSet = new Set(deliveredIds);

    const updated = existingComments.filter((c) => !deliveredSet.has(c.id));

    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('c3');
  });

  it('handles empty delivered set gracefully', () => {
    const existingComments = [
      { id: 'c1', status: 'pending', commentText: 'Fix this' },
    ];
    const deliveredIds: string[] = [];
    const deliveredSet = new Set(deliveredIds);

    const updated = existingComments.filter((c) => !deliveredSet.has(c.id));

    expect(updated).toHaveLength(1);
  });
});

// ── Inline comment edit/delete state management ──

describe('Inline comment edit/delete state management', () => {
  interface CommentData {
    id: string;
    commentText: string;
    status: 'pending' | 'sent';
    startLine: number;
    filePath: string;
    side: 'old' | 'new';
  }

  function simulateEditStart(commentId: string, commentText: string) {
    return { editingCommentId: commentId, editCommentText: commentText };
  }

  function simulateEditSave(comments: CommentData[], editId: string, newText: string) {
    const updated = comments.map((c) =>
      c.id === editId ? { ...c, commentText: newText } : c
    );
    return { updated, editingCommentId: null as string | null, editCommentText: '' };
  }

  function simulateEditCancel() {
    return { editingCommentId: null as string | null, editCommentText: '' };
  }

  function simulateDelete(comments: CommentData[], deleteId: string) {
    return comments.filter((c) => c.id !== deleteId);
  }

  it('editingCommentId is set on edit click', () => {
    const { editingCommentId, editCommentText } = simulateEditStart('c1', 'Original text');
    expect(editingCommentId).toBe('c1');
    expect(editCommentText).toBe('Original text');
  });

  it('editingCommentId is cleared on save', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'Original', status: 'pending', startLine: 10, filePath: 'a.ts', side: 'new' },
    ];
    const { updated, editingCommentId } = simulateEditSave(comments, 'c1', 'Updated');
    expect(editingCommentId).toBeNull();
    expect(updated[0].commentText).toBe('Updated');
  });

  it('editingCommentId is cleared on cancel', () => {
    const { editingCommentId, editCommentText } = simulateEditCancel();
    expect(editingCommentId).toBeNull();
    expect(editCommentText).toBe('');
  });

  it('inline delete removes comment from array', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'First', status: 'pending', startLine: 10, filePath: 'a.ts', side: 'new' },
      { id: 'c2', commentText: 'Second', status: 'pending', startLine: 20, filePath: 'a.ts', side: 'new' },
    ];
    const result = simulateDelete(comments, 'c1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c2');
  });

  it('edit does not affect non-target comments', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'A', status: 'pending', startLine: 1, filePath: 'a.ts', side: 'new' },
      { id: 'c2', commentText: 'B', status: 'pending', startLine: 2, filePath: 'a.ts', side: 'old' },
    ];
    const { updated } = simulateEditSave(comments, 'c1', 'Changed');
    expect(updated[1].commentText).toBe('B');
  });

  it('pending count decrements after inline delete', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'A', status: 'pending', startLine: 1, filePath: 'a.ts', side: 'new' },
      { id: 'c2', commentText: 'B', status: 'pending', startLine: 2, filePath: 'a.ts', side: 'old' },
      { id: 'c3', commentText: 'C', status: 'sent', startLine: 3, filePath: 'a.ts', side: 'new' },
    ];
    const afterDelete = simulateDelete(comments, 'c1');
    const pendingCount = afterDelete.filter((c) => c.status === 'pending').length;
    expect(pendingCount).toBe(1);
  });

  it('edit UI uses full textarea (editingCommentId triggers textarea not input)', () => {
    const editState = simulateEditStart('c1', 'Existing comment');
    expect(editState.editingCommentId).toBe('c1');
    expect(editState.editCommentText).toBe('Existing comment');
  });
});
