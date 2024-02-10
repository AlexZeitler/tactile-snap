import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import { buildNumberWidget } from './common.js';

const TILE_COLORS = [
    {id: 'text-color', desc: 'Text color'},
    {id: 'border-color', desc: 'Border color'},
    {id: 'background-color', desc: 'Background color'},
];

const TILE_SIZES = [
    {id: 'text-size', desc: 'Text size'},
    {id: 'border-size', desc: 'Border size'},
    {id: 'gap-size', desc: 'Gap size'},
];

const GRID_SIZES = [
    {id: 'grid-cols', desc: 'Columns', min: 1, max: 7},
    {id: 'grid-rows', desc: 'Rows', min: 1, max: 5},
];

export const AdvancedPage = GObject.registerClass(
class AdvancedPage extends Adw.PreferencesPage {
    constructor(settings: Gio.Settings) {
        super({
            title: "Advanced",
            icon_name: 'preferences-other-symbolic',
            name: "Advanced",
        });

        const grid = new Gtk.Grid({
            halign: Gtk.Align.CENTER,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12,
            column_spacing: 12,
            row_spacing: 12,
            visible: true
        });

        const tilesLabel = new Gtk.Label({
            label: '<b>Tile appearance</b>',
            use_markup: true,
            visible: true
        });
        grid.attach(tilesLabel, 0, 0, 1, 1);
        grid.attach(buildTileAppearanceWidget(settings), 0, 1, 1, 1);

        const gridLabel = new Gtk.Label({
            label: '<b>Grid size</b>',
            use_markup: true,
            visible: true
        });
        grid.attach(gridLabel, 0, 2, 1, 1);
        grid.attach(buildGridSizeWidget(settings), 0, 3, 1, 1);

        const behaviorLabel = new Gtk.Label({
            label: '<b>Behavior</b>',
            use_markup: true,
            visible: true
        });
        grid.attach(behaviorLabel, 0, 4, 1, 1);
        grid.attach(buildBehaviorWidget(settings), 0, 5, 1, 1);
        const group = new Adw.PreferencesGroup();
        group.add(grid);
        this.add(group);
    }
});

function buildTileAppearanceWidget(settings: Gio.Settings): Gtk.Grid {
    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });

    TILE_COLORS.forEach((color, index) => {
        const label = new Gtk.Label({
            halign: Gtk.Align.END,
            label: color.desc,
            visible: true
        });
        grid.attach(label, 0, index, 1, 1);

        const widget = buildColorWidget(settings, color.id);
        grid.attach(widget, 1, index, 1, 1);
    });

    TILE_SIZES.forEach((size, index) => {
        const label = new Gtk.Label({
            halign: Gtk.Align.END,
            label: size.desc,
            visible: true
        });
        grid.attach(label, 2, index, 1, 1);

        const widget = buildNumberWidget(settings, size.id);
        grid.attach(widget, 3, index, 1, 1);
    });

    return grid;
}

function buildGridSizeWidget(settings: Gio.Settings): Gtk.Grid {
    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });

    GRID_SIZES.forEach((size, index) => {
        const label = new Gtk.Label({
            halign: Gtk.Align.END,
            label: size.desc,
            visible: true
        });
        grid.attach(label, 0, index, 1, 1);

        const widget = buildNumberWidget(settings, size.id, size.min, size.max);
        grid.attach(widget, 1, index, 1, 1);
    });

    return grid;
}

function buildBehaviorWidget(settings: Gio.Settings): Gtk.Grid {
    const grid = new Gtk.Grid({
        halign: Gtk.Align.CENTER,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });

    const maximizeWidget = buildCheckWidget(settings, "maximize", "Maximize window when possible");
    grid.attach(maximizeWidget, 0, 0, 1, 1);

    const debugWidget = buildCheckWidget(settings, "debug", "Log debug information to journal");
    grid.attach(debugWidget, 0, 1, 1, 1);

    return grid;
}

function buildCheckWidget(settings: Gio.Settings, id: string, label: string): Gtk.CheckButton {
    const check = new Gtk.CheckButton({
        label: label,
        visible: true
    });
    settings.bind(id, check, 'active', Gio.SettingsBindFlags.DEFAULT);
    return check;
}

function buildColorWidget(settings: Gio.Settings, id: string): Gtk.ColorButton {
    const rgba = new Gdk.RGBA();
    rgba.parse(settings.get_string(id)!);

    const color = new Gtk.ColorButton({
        rgba: rgba,
        show_editor: true,
        use_alpha: true,
        visible: true
    });

    color.connect('color-set', function () {
        settings.set_string(id, color.get_rgba().to_string()!);
    });

    return color;
}

