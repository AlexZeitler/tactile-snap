import GLib from "gi://GLib";
import type Gio from "gi://Gio";

import { Slot } from "./slots.js";

export const NUM_LAYOUTS = 4;

/** Auto-snap layout and slots for the windows of one application. */
export type AppRule = {
    /** Desktop file id, e.g. "google-chrome.desktop". */
    app: string;
    layout: number;
    slots: Slot[];
};

/** The stored rules. Rules with a layout that does not exist are dropped. */
export function loadAppRules(settings: Gio.Settings): AppRule[] {
    const stored = settings.get_value("auto-snap-app-rules").deepUnpack() as [string, number, Slot[]][];
    return stored
        .map(([app, layout, slots]) => ({ app, layout, slots }))
        .filter((rule) => rule.layout >= 1 && rule.layout <= NUM_LAYOUTS);
}

export function saveAppRules(settings: Gio.Settings, rules: AppRule[]): void {
    settings.set_value(
        "auto-snap-app-rules",
        new GLib.Variant(
            "a(sia(iiii))",
            rules.map((rule): [string, number, Slot[]] => [rule.app, rule.layout, rule.slots]),
        ),
    );
}
