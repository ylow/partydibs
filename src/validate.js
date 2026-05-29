function bounded(min, max) {
  return (raw) => {
    if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
    const value = raw.trim();
    if (value.length < min) return { ok: false, error: `must be at least ${min} char(s)` };
    if (value.length > max) return { ok: false, error: `must be at most ${max} chars` };
    return { ok: true, value };
  };
}

export const validateTitle = bounded(1, 100);
export const validateItemName = bounded(1, 100);
export const validateClaimerName = bounded(1, 60);
export const validatePassword = bounded(1, 200);

export function validateItemNote(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  const value = raw.trim();
  if (value.length === 0) return { ok: true, value: null };
  if (value.length > 500) return { ok: false, error: 'must be at most 500 chars' };
  return { ok: true, value };
}

export function validateMessage(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  const value = raw.trim();
  if (value.length === 0) return { ok: true, value: null };
  if (value.length > 1000) return { ok: false, error: 'must be at most 1000 chars' };
  return { ok: true, value };
}
