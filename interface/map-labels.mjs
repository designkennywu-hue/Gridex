// Boxes use screen pixels so zoom changes available space, not text size.
export function prioritizeLabels(candidates, {overlapTolerance = .03, horizontalPadding = 24, verticalPadding = 14} = {}) {
  const accepted = [];
  const ordered = candidates.map(label => ({...label, left:label.left-horizontalPadding, right:label.right+horizontalPadding, top:label.top-verticalPadding, bottom:label.bottom+verticalPadding})).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const candidate of ordered) {
    let overlap = 0;
    const crowded = accepted.some(other => {
      const width = Math.max(0, Math.min(candidate.right, other.right) - Math.max(candidate.left, other.left));
      const height = Math.max(0, Math.min(candidate.bottom, other.bottom) - Math.max(candidate.top, other.top));
      const area = width * height;
      overlap += area;
      const smaller = Math.min((candidate.right-candidate.left)*(candidate.bottom-candidate.top), (other.right-other.left)*(other.bottom-other.top));
      return area > smaller * overlapTolerance;
    });
    const area = (candidate.right-candidate.left)*(candidate.bottom-candidate.top);
    if (candidate.required || (!crowded && overlap <= area * .05)) accepted.push(candidate);
  }
  return accepted;
}
