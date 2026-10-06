import { Layout } from "./layout.js";

/** A slot in grid cells: [col, row, cols, rows]. */
export type Slot = [number, number, number, number];

/** True if the slot lies within the grid and spans at least one visible column and row. */
export function isSlotVisible(layout: Layout, [c, r, w, h]: Slot): boolean {
    return (
        c >= 0 &&
        r >= 0 &&
        w >= 1 &&
        h >= 1 &&
        c + w <= layout.cols.length &&
        r + h <= layout.rows.length &&
        layout.cols.slice(c, c + w).some((weight) => weight > 0) &&
        layout.rows.slice(r, r + h).some((weight) => weight > 0)
    );
}

/** Every visible cell as a slot of its own, row by row. */
export function cellSlots(layout: Layout): Slot[] {
    return layout.rows.flatMap((rowWeight, r) =>
        rowWeight > 0 ? layout.cols.flatMap((colWeight, c) => (colWeight > 0 ? [[c, r, 1, 1] as Slot] : [])) : [],
    );
}

/** The configured slots that are visible in the layout, or every visible cell if there are none. */
export function effectiveSlots(layout: Layout, configured: Slot[]): Slot[] {
    const visible = configured.filter((slot) => isSlotVisible(layout, slot));
    return visible.length > 0 ? visible : cellSlots(layout);
}
