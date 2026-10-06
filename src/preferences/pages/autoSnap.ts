import GLib from "gi://GLib";
import GObject from "gi://GObject";
import type Gio from "gi://Gio";
import Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";
import Adw from "gi://Adw";

import { Area } from "../../common/area.js";
import { Layout } from "../../common/layout.js";
import { sumAll } from "../../common/arrays.js";
import { Slot, effectiveSlots } from "../../common/slots.js";

import { createCheckboxInput } from "../inputs/checkbox.js";

const NUM_LAYOUTS = 4;

type ParseResult = { slots: Slot[] } | { error: string };

export const AutoSnapPage = GObject.registerClass(
    class AutoSnapPage extends Adw.PreferencesPage {
        constructor(settings: Gio.Settings) {
            super({
                title: "Auto-snap",
                icon_name: "view-grid-symbolic",
                name: "AutoSnapPage",
            });

            const grid = new Gtk.Grid({
                halign: Gtk.Align.CENTER,
                margin_start: 12,
                margin_end: 12,
                margin_top: 12,
                margin_bottom: 12,
                column_spacing: 12,
                row_spacing: 12,
                visible: true,
            });

            const behaviorLabel = new Gtk.Label({
                label: "<b>Behavior</b>",
                use_markup: true,
                visible: true,
            });
            grid.attach(behaviorLabel, 0, 0, 1, 1);

            const autoSnapInput = createCheckboxInput(
                settings,
                "auto-snap",
                "Snap new windows to the first free grid slot",
            );
            grid.attach(autoSnapInput, 0, 1, 1, 1);

            const layoutLabel = new Gtk.Label({
                label: "<b>Layout</b>",
                use_markup: true,
                visible: true,
            });
            grid.attach(layoutLabel, 0, 2, 1, 1);
            grid.attach(createLayoutInput(settings), 0, 3, 1, 1);

            const slotsLabel = new Gtk.Label({
                label: "<b>Slots</b>",
                use_markup: true,
                visible: true,
            });
            grid.attach(slotsLabel, 0, 4, 1, 1);
            grid.attach(createSlotsSection(settings), 0, 5, 1, 1);

            const group = new Adw.PreferencesGroup();
            group.add(grid);
            this.add(group);

            // Adw.PreferencesPage disables horizontal scrolling, but we need it
            // https://gitlab.gnome.org/GNOME/libadwaita/-/blob/main/src/adw-preferences-page.ui
            (this.get_first_child() as Gtk.ScrolledWindow).hscrollbar_policy = Gtk.PolicyType.AUTOMATIC;
        }
    },
);

function createLayoutInput(settings: Gio.Settings): Gtk.DropDown {
    const names = Array.from({ length: NUM_LAYOUTS }, (_, i) => `Layout ${i + 1}`);
    const dropdown = Gtk.DropDown.new_from_strings(names);
    dropdown.halign = Gtk.Align.CENTER;

    function syncFromSettings(): void {
        dropdown.selected = settings.get_int("auto-snap-layout") - 1;
    }
    syncFromSettings();

    dropdown.connect("notify::selected", () => {
        const n = dropdown.selected + 1;
        if (settings.get_int("auto-snap-layout") !== n) {
            settings.set_int("auto-snap-layout", n);
        }
    });
    settings.connect("changed::auto-snap-layout", syncFromSettings);

    return dropdown;
}

function createSlotsSection(settings: Gio.Settings): Gtk.Grid {
    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        column_spacing: 12,
        row_spacing: 12,
        visible: true,
    });

    const entry = new Gtk.Entry({
        halign: Gtk.Align.CENTER,
        placeholder_text: "e.g. QX EV",
        width_chars: 24,
        visible: true,
    });
    grid.attach(entry, 0, 0, 1, 1);

    const errorLabel = new Gtk.Label({
        css_classes: ["error"],
        visible: false,
    });
    grid.attach(errorLabel, 0, 1, 1, 1);

    const hint = new Gtk.Label({
        label:
            "Type two tiles per slot, separated by spaces, in order of preference. Press Enter to save.\n" +
            "Leave empty to use every tile as a slot. Numbers in the preview show the order.",
        justify: Gtk.Justification.CENTER,
        visible: true,
    });
    grid.attach(hint, 0, 2, 1, 1);

    const preview = createPreviewWidget(settings);
    grid.attach(preview, 0, 3, 1, 1);

    function currentLayout(): Layout {
        return Layout.fromSettings(settings, settings.get_int("auto-snap-layout"));
    }

    function validate(): ParseResult {
        const result = parseSlots(entry.text, visibleTiles(settings, currentLayout()));
        if ("error" in result) {
            errorLabel.label = result.error;
            errorLabel.visible = true;
            entry.add_css_class("error");
        } else {
            errorLabel.visible = false;
            entry.remove_css_class("error");
        }
        return result;
    }

    entry.text = formatSlots(settings, storedSlots(settings));

    entry.connect("activate", () => {
        const result = validate();
        if ("slots" in result) {
            settings.set_value("auto-snap-slots", new GLib.Variant("a(iiii)", result.slots));
        }
    });

    settings.connect("changed", (_settings: Gio.Settings, key: string) => {
        if (key === "auto-snap-slots") {
            entry.text = formatSlots(settings, storedSlots(settings));
        }
        // The layout or the tile keys may have changed, so the text may no longer fit
        validate();
    });

    return grid;
}

function createPreviewWidget(settings: Gio.Settings): Gtk.Grid {
    const grid = new Gtk.Grid({
        column_homogeneous: true,
        row_homogeneous: true,
        width_request: 480,
        height_request: 240,
        visible: true,
    });

    let tiles: Gtk.Label[] = [];

    function discardTiles(): void {
        tiles.forEach((tile) => grid.remove(tile));
        tiles = [];
    }

    function createTiles(): void {
        const layout = Layout.fromSettings(settings, settings.get_int("auto-snap-layout"));
        const slots = effectiveSlots(layout, storedSlots(settings));
        const tablearea = new Area(0, 0, sumAll(layout.cols), sumAll(layout.rows));

        layout.cols.forEach((colWeight, col) => {
            layout.rows.forEach((rowWeight, row) => {
                if (colWeight < 1 || rowWeight < 1) {
                    return;
                }
                const name = settings.get_strv(`tile-${col}-${row}`)[0] || "";
                const numbers = slots
                    .map((slot, index) => (containsCell(slot, col, row) ? `${index + 1}` : ""))
                    .filter((number) => number !== "")
                    .join(", ");
                const area = tablearea.subareaIgnoreGaps(layout, col, row);

                const tile = new Gtk.Label({
                    halign: Gtk.Align.FILL,
                    label: numbers ? `${name.toUpperCase()}\n${numbers}` : name.toUpperCase(),
                    justify: Gtk.Justification.CENTER,
                    visible: true,
                });
                tile.get_style_context().add_class("tile");

                grid.attach(tile, area.x, area.y, area.width, area.height);
                tiles.push(tile);
            });
        });
    }

    createTiles();

    settings.connect("changed", () => {
        discardTiles();
        createTiles();
    });

    return grid;
}

function storedSlots(settings: Gio.Settings): Slot[] {
    return settings.get_value("auto-snap-slots").deepUnpack() as Slot[];
}

function containsCell([c, r, w, h]: Slot, col: number, row: number): boolean {
    return col >= c && col < c + w && row >= r && row < r + h;
}

/** The character typed for a tile, upper-cased, or undefined if its key prints nothing. */
function tileChar(settings: Gio.Settings, col: number, row: number): string | undefined {
    const name = settings.get_strv(`tile-${col}-${row}`)[0];
    if (!name) {
        return undefined;
    }
    const [ok, keyval] = Gtk.accelerator_parse(name);
    const code = ok ? Gdk.keyval_to_unicode(keyval) : 0;
    return code > 0 ? String.fromCodePoint(code).toUpperCase() : undefined;
}

/** Tile characters of the visible cells, mapped to [col, row]. */
function visibleTiles(settings: Gio.Settings, layout: Layout): Map<string, [number, number]> {
    const tiles = new Map<string, [number, number]>();
    layout.rows.forEach((rowWeight, row) => {
        layout.cols.forEach((colWeight, col) => {
            if (colWeight < 1 || rowWeight < 1) {
                return;
            }
            const char = tileChar(settings, col, row);
            if (char && !tiles.has(char)) {
                tiles.set(char, [col, row]);
            }
        });
    });
    return tiles;
}

/** Parses "QX EV" into slots. Two tiles span a slot, like typing them after Super+T. */
function parseSlots(text: string, tiles: Map<string, [number, number]>): ParseResult {
    const slots: Slot[] = [];
    for (const token of text
        .trim()
        .split(/\s+/)
        .filter((t) => t !== "")) {
        const chars = [...token.toUpperCase()];
        if (chars.length !== 2) {
            return { error: `"${token}": a slot needs exactly two tiles` };
        }
        const missing = chars.find((char) => !tiles.has(char));
        if (missing !== undefined) {
            return { error: `"${token}": there is no tile "${missing}" in this layout` };
        }
        const [[c1, r1], [c2, r2]] = chars.map((char) => tiles.get(char)!);
        slots.push([Math.min(c1, c2), Math.min(r1, r2), Math.abs(c1 - c2) + 1, Math.abs(r1 - r2) + 1]);
    }
    return { slots };
}

/** Formats slots as tile pairs, e.g. "QX EV". */
function formatSlots(settings: Gio.Settings, slots: Slot[]): string {
    return slots
        .map(([c, r, w, h]) => (tileChar(settings, c, r) ?? "?") + (tileChar(settings, c + w - 1, r + h - 1) ?? "?"))
        .join(" ");
}
