/**
 * FeeNote: the (i) next to a "you get" figure (TUL-1890). The glyph stays
 * small, but the button itself is a real 44 x 44 px box (min-h-11 min-w-11);
 * the negative margin keeps the surrounding line layout unchanged.
 */
export function FeeNote({ text }: { text: string }) {
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      data-testid="fee-note"
      className="-mx-3 -my-3 inline-flex h-11 min-h-11 w-11 min-w-11 cursor-help items-center justify-center align-middle"
    >
      <span aria-hidden>ⓘ</span>
    </button>
  );
}
