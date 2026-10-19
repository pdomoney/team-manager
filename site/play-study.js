// Read-only learning sequence for a play. Existing play geometry is authoritative.
// Text steps are instructions, not timestamps: do not infer a ball-transfer order
// from their wording. Future coaches can explicitly annotate phases with study cues.
const text = x => String(x ?? '').trim();
const cardsFromAuthored = (phase, at, mirror) => (Array.isArray(phase?.study) ? phase.study : [])
  .filter(x => x && typeof x === 'object' && text(x.text))
  .map((x, i) => ({
    phase: at, title: text(mirror(x.title)) || `Action ${i + 1}`,
    text: text(mirror(x.text)),
    moves: Array.isArray(x.moves) ? [...new Set(x.moves.filter(k => Number.isSafeInteger(k) && k >= 0 && k < (phase.moves || []).length))] : [],
    roles: Array.isArray(x.roles) ? [...new Set(x.roles.filter(v => typeof v === 'string' && v.length <= 40))] : [],
    linked: true
  }));

export function studyCards(play, steps = [], mirror = x => String(x ?? '')) {
  const phases = [play, ...(Array.isArray(play?.phases) ? play.phases : [])];
  const result = [];
  phases.forEach((ph, phase) => {
    const made = cardsFromAuthored(ph, phase, mirror);
    if (made.length) { result.push(...made); return; }
    // Legacy single-phase plays have coaching instructions, but do not claim these
    // instructions are synchronized to an inferred sequence of SVG movement lines.
    if (phases.length === 1 && steps.length) {
      steps.filter(t => text(t)).forEach((t, i) => result.push({
        phase, title: `Step ${i + 1}`, text: text(t), moves: [], roles: [], linked: false
      }));
      return;
    }
    const title = text(mirror(ph?.title)) || `Phase ${phase + 1}`;
    result.push({ phase, title, text: title, moves: [], roles: [], linked: false });
  });
  return result.length ? result : [{ phase: 0, title: 'Overview', text: 'Review the player positions and movement lines.', moves: [], roles: [], linked: false }];
}

// Whole-word matching prevents LM from highlighting an unrelated name or a word
// such as "calm". Numeric codes are deliberately not guessed from prose ("tag 5").
// A selected user role takes precedence over this cue-based highlighting.
export function cueRoles(cue, roleCodes) {
  const s = text(cue), codes = Array.isArray(roleCodes) ? roleCodes : [];
  return [...new Set(codes.filter(c => typeof c === 'string' && /^[A-Za-z][\w-]{0,12}$/.test(c))
    .filter(c => new RegExp(`(^|[^A-Za-z0-9_])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z0-9_])`, 'i').test(s)))];
}
