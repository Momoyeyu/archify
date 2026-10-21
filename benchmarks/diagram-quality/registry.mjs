// Versioned purpose registry: diagnostic components are not arbitrary score weights.
export const metrics = [
  { id: 'semantic.nodes', purpose: 'Retain required entities; penalize invented entities', unit: 'precision/recall/F1', role: 'guard' },
  { id: 'semantic.edges', purpose: 'Retain directed relations and required labels', unit: 'precision/recall/F1', role: 'guard' },
  { id: 'render.visibility', purpose: 'Source facts must exist in the final painted artifact', unit: 'verified status', role: 'guard' },
  { id: 'geometry.defects', purpose: 'Detect clipping, collisions, unreadably small text and unrelated node intrusions', unit: 'counts, defects/node', role: 'pilot guard' },
  { id: 'editability', purpose: 'Reload source, rename one entity and render again without changing other facts', unit: 'pass/fail/unknown', role: 'guard' },
  { id: 'objective.successRate', purpose: 'Fraction of all planned runs passing guards within budget', unit: 'fraction', role: 'objective' },
  { id: 'objective.mrr', purpose: 'Reward earlier independently verified usable candidates', unit: 'mean reciprocal round', role: 'optional optimization objective' },
  { id: 'objective.timeToSuccessMs', purpose: 'Time to first verified usable candidate, excluding offline grader time', unit: 'ms; failures censored', role: 'outcome' },
  { id: 'usage', purpose: 'Measure complete invocation cost including failed attempts, cache and reasoning', unit: 'tokens/USD; unknown retained', role: 'outcome' },
  { id: 'human', purpose: 'Optional readability, hierarchy, layout, style and aesthetic preference', unit: 'five ordinal 1–5 ratings + separate semantics', role: 'human only; never optimizer score' },
];

export const humanRubric = {
  version: 'diagram-quality-human-v1',
  fields: ['readability', 'hierarchy', 'layout', 'style', 'aesthetics'],
  anchors: {
    readability: ['Cannot follow text or routes', 'Usable with repeated searching', 'Paths and labels immediately traceable'],
    hierarchy: ['Grouping obscures meaning', 'Main groups clear', 'Hierarchy supports understanding'],
    layout: ['Crowded or unbalanced', 'Usable with local spacing issues', 'Balanced alignment, density and spacing'],
    style: ['Inconsistent or low contrast', 'Mostly consistent', 'Consistent and meaningfully differentiated'],
    aesthetics: ['Would not use', 'Acceptable', 'Would use or share directly'],
  },
  protocol: 'Blind tool/model/cost/scores, randomize A/B with saved seed, allow tie/both unusable; at least two independent raters for claims, third on disputes. Author self-rating is not independent. Preserve all raw ratings. No human rating changes objective.',
};
