"""Place stream callouts clear of equipment, routes and other text."""

import textwrap


def intersects(a, b, margin=4):
    return (
        a[0] < b[2] + margin
        and a[2] > b[0] - margin
        and a[1] < b[3] + margin
        and a[3] > b[1] - margin
    )


def crosses(rect, a, b):
    if a[1] == b[1]:
        return (
            rect[1] - 4 < a[1] < rect[3] + 4
            and min(a[0], b[0]) < rect[2] + 4
            and max(a[0], b[0]) > rect[0] - 4
        )
    return (
        rect[0] - 4 < a[0] < rect[2] + 4
        and min(a[1], b[1]) < rect[3] + 4
        and max(a[1], b[1]) > rect[1] - 4
    )


def place_labels(entries, obstacles, all_segments, width, height):
    occupied = list(obstacles)
    placed = []
    for entry in entries:
        title = textwrap.wrap(entry["title"], 28) or ["Stream"]
        detail = textwrap.wrap(entry["values"], 30) if entry["values"] else []
        lines = title + detail
        w = max(len(line) for line in lines) * 8 + 20
        h = len(lines) * 21 + 14
        candidates = []
        for a, b in entry["segments"]:
            if abs(a[0] - b[0]) + abs(a[1] - b[1]) < 60:
                continue
            for fraction in (0.5, 0.25, 0.75):
                x, y = a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction
                for gap in (14, 40, 70, 110, 160):
                    for rx, ry in (
                        (x - w / 2, y - gap - h),
                        (x - w / 2, y + gap),
                        (x + gap, y - h / 2),
                        (x - gap - w, y - h / 2),
                    ):
                        candidates.append((gap, (rx, ry, rx + w, ry + h), (x, y)))
        candidates.sort(key=lambda c: c[0])

        def available(rect):
            return (
                rect[0] >= 20
                and rect[1] >= 20
                and rect[2] <= width - 20
                and not any(intersects(rect, box) for box in occupied)
                and not any(crosses(rect, a, b) for a, b in all_segments)
            )

        found = next(
            ((rect, anchor) for _, rect, anchor in candidates if available(rect)), None
        )
        if found is None:
            # Dedicated lower callout lane when a crowded diagram has no nearby space.
            x, y = 30, height + 24
            while not available((x, y, x + w, y + h)):
                y += h + 16
            found = ((x, y, x + w, y + h), entry["segments"][0][0])
        rect, anchor = found
        occupied.append(rect)
        placed.append(
            {
                **entry,
                "rect": rect,
                "anchor": anchor,
                "title_lines": title,
                "detail_lines": detail,
            }
        )
        height = max(height, rect[3] + 30)
    return placed, height
