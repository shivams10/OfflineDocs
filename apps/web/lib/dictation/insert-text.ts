export interface TextSelection {
  start: number;
  end: number;
}

export interface InsertResult {
  body: string;
  /** Where the caret belongs afterwards: just past the inserted text. */
  caret: number;
}

/**
 * Inserts `text` over `selection` in `body`, padding with a single space where
 * it would otherwise run into a neighbouring word. With no known selection the
 * text goes at the end.
 *
 * The selection is clamped because it is the *last-known* cursor: the body may
 * have shrunk since (a collaborator's save applied on reload, or an undo).
 */
export function insertText(
  body: string,
  selection: TextSelection | null,
  text: string,
): InsertResult {
  const clean = text.trim();
  const max = body.length;
  const start = Math.min(Math.max(selection?.start ?? max, 0), max);
  const end = Math.min(Math.max(selection?.end ?? max, start), max);

  if (!clean) return { body, caret: end };

  const before = body.slice(0, start);
  const after = body.slice(end);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) ? " " : "";

  const inserted = `${lead}${clean}${trail}`;
  return {
    body: before + inserted + after,
    caret: start + lead.length + clean.length,
  };
}
