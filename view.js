// Keep existing DOM nodes during local interactions so images, focus and
// sheet animations survive a state update. Navigation still renders a new page.
function key(node) {
  if (node.nodeType !== 1) return null;
  if (node.id) return `id:${node.id}`;
  if (node.matches('.meal-card')) return node.querySelector('a')?.getAttribute('href');
  if (node.dataset.action) return `${node.tagName}:${node.dataset.action}:${node.dataset.id || ''}:${node.dataset.key || ''}:${node.dataset.value || ''}`;
  return null;
}
function compatible(a, b) {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName && key(a) === key(b);
}
function patchNode(current, next) {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attr of [...current.attributes]) {
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of next.attributes) {
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
  patchChildren(current, next);
  if (current.matches('input,textarea,select') && current.value !== next.value) current.value = next.value;
  if (current.matches('input')) current.checked = next.checked;
}
export function patchChildren(parent, next) {
  let cursor = parent.firstChild;
  for (const wanted of [...next.childNodes]) {
    let match = cursor;
    if (!match || !compatible(match, wanted)) {
      match = key(wanted) ? [...parent.childNodes].find(n => compatible(n, wanted)) : null;
      if (match) parent.insertBefore(match, cursor);
      else {
        parent.insertBefore(wanted.cloneNode(true), cursor);
        continue;
      }
    }
    patchNode(match, wanted);
    cursor = match.nextSibling;
  }
  while (cursor) { const nextSibling = cursor.nextSibling; cursor.remove(); cursor = nextSibling; }
}
export function patchHTML(parent, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(parent, template.content);
}
