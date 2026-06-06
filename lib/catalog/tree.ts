/**
 * Category tree construction & traversal. Pure.
 */
import type { Category, CategoryNode } from "@/lib/types";

/** Build a sorted forest of category nodes from a flat list. */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const c of categories) {
    byId.set(c.id, { ...c, children: [] });
  }

  const roots: CategoryNode[] = [];
  for (const c of categories) {
    const node = byId.get(c.id);
    if (!node) continue;
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (nodes: CategoryNode[]): CategoryNode[] =>
    [...nodes]
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko"))
      .map((n) => ({ ...n, children: sortRec(n.children) }));

  return sortRec(roots);
}

/** All descendant category ids (inclusive) of a given category, from a flat list. */
export function expandCategoryIds(
  categories: Category[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parent_id) continue;
    const arr = childrenByParent.get(c.parent_id) ?? [];
    childrenByParent.set(c.parent_id, [...arr, c.id]);
  }

  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return result;
}

/** Flatten a forest depth-first (useful for breadcrumbs / selects). */
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}
