"""Orthogonal documentation routes avoiding equipment footprints."""

import heapq
from itertools import pairwise


def route(start, end, boxes, used):
    xs = sorted(
        {
            start[0],
            end[0],
            *[x for left, _, right, _ in boxes for x in (left - 24, right + 24)],
        }
    )
    ys = sorted(
        {
            start[1],
            end[1],
            *[y for _, top, _, bottom in boxes for y in (top - 32, bottom + 32)],
        }
    )
    origin = (xs.index(start[0]), ys.index(start[1]))
    target = (xs.index(end[0]), ys.index(end[1]))

    def clear(a, b):
        x1, y1 = a
        x2, y2 = b
        return not any(
            (min(x1, x2) < right and max(x1, x2) > left and top < y1 < bottom)
            if y1 == y2
            else (min(y1, y2) < bottom and max(y1, y2) > top and left < x1 < right)
            for left, top, right, bottom in boxes
        )

    queue = [(0, origin, -1, [start])]
    best = {}
    while queue:
        cost, (ix, iy), direction, path = heapq.heappop(queue)
        if (ix, iy) == target:
            for a, b in pairwise(path):
                used.add(tuple(sorted((a, b))))
            simplified = [path[0]]
            for index in range(1, len(path) - 1):
                before, current, after = path[index - 1 : index + 2]
                if not (
                    before[0] == current[0] == after[0]
                    or before[1] == current[1] == after[1]
                ):
                    simplified.append(current)
            return simplified + [path[-1]]
        for nx, ny, new_direction in [
            (ix - 1, iy, 0),
            (ix + 1, iy, 0),
            (ix, iy - 1, 1),
            (ix, iy + 1, 1),
        ]:
            if not (0 <= nx < len(xs) and 0 <= ny < len(ys)):
                continue
            a, b = (xs[ix], ys[iy]), (xs[nx], ys[ny])
            if not clear(a, b):
                continue
            next_cost = (
                cost
                + abs(a[0] - b[0])
                + abs(a[1] - b[1])
                + (24 if direction != new_direction else 0)
                + (80 if tuple(sorted((a, b))) in used else 0)
            )
            state = (nx, ny, new_direction)
            if next_cost < best.get(state, float("inf")):
                best[state] = next_cost
                heapq.heappush(queue, (next_cost, (nx, ny), new_direction, path + [b]))
    raise ValueError(f"No documentation route from {start} to {end}")
