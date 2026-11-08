/**
 * ENG-60: Tarjan's Strongly Connected Components algorithm.
 * - Duyệt khóa đã sort
 * - Bỏ self-loop
 * - Không đệ quy sâu vô hạn (sử dụng call stack tường minh)
 */
export function tarjanScc(
  nodes: string[],
  adj: Map<string, Iterable<string>>
): string[][] {
  const sortedNodes = [...nodes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let indexCounter = 0;

  interface Frame {
    u: string;
    neighbors: string[];
    nextIdx: number;
  }

  for (const root of sortedNodes) {
    if (indices.has(root)) {
      continue;
    }

    indices.set(root, indexCounter);
    lowlinks.set(root, indexCounter);
    indexCounter++;
    stack.push(root);
    onStack.add(root);

    const rootNeighbors = Array.from(adj.get(root) ?? []).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    const callStack: Frame[] = [
      { u: root, neighbors: rootNeighbors, nextIdx: 0 },
    ];

    while (callStack.length > 0) {
      const top = callStack[callStack.length - 1];
      const u = top.u;

      if (top.nextIdx < top.neighbors.length) {
        const v = top.neighbors[top.nextIdx++];
        if (v === u) {
          // Bỏ self-loop
          continue;
        }

        if (!indices.has(v)) {
          // v chưa được duyệt
          indices.set(v, indexCounter);
          lowlinks.set(v, indexCounter);
          indexCounter++;
          stack.push(v);
          onStack.add(v);

          const vNeighbors = Array.from(adj.get(v) ?? []).sort((a, b) =>
            a < b ? -1 : a > b ? 1 : 0
          );
          callStack.push({ u: v, neighbors: vNeighbors, nextIdx: 0 });
        } else if (onStack.has(v)) {
          // v đã ở trên stack
          const curLow = lowlinks.get(u)!;
          const vIndex = indices.get(v)!;
          if (vIndex < curLow) {
            lowlinks.set(u, vIndex);
          }
        }
      } else {
        // Đã duyệt hết hàng xóm của u
        callStack.pop();

        if (callStack.length > 0) {
          const parentFrame = callStack[callStack.length - 1];
          const parentLow = lowlinks.get(parentFrame.u)!;
          const uLow = lowlinks.get(u)!;
          if (uLow < parentLow) {
            lowlinks.set(parentFrame.u, uLow);
          }
        }

        // Kiểm tra u có phải là gốc của SCC không
        if (lowlinks.get(u) === indices.get(u)) {
          const scc: string[] = [];
          while (true) {
            const w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
            if (w === u) {
              break;
            }
          }
          scc.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          sccs.push(scc);
        }
      }
    }
  }

  return sccs;
}
