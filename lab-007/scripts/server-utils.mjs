import { isAbsolute, relative, resolve } from 'node:path';

export function resolveStaticPath(root, pathname) {
  const staticRoot = resolve(root);
  const decoded = decodeURIComponent(pathname).replace(/^[\\/]+/, '') || 'index.html';
  const target = resolve(staticRoot, decoded);
  const distance = relative(staticRoot, target);
  if (distance.startsWith('..') || isAbsolute(distance)) throw new Error('unsafe path');
  return target;
}
