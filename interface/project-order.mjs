// Place an item on either side of a target without disturbing hidden/archived items.
export function moveProject(order, from, to, edge = 'before') {
  if (!order.includes(from) || !order.includes(to) || from === to) return order;
  const next = order.filter(id => id !== from);
  next.splice(next.indexOf(to) + (edge === 'after' ? 1 : 0), 0, from);
  return next;
}
