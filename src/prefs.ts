import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { LayoutPage } from './preferences/layoutPage.js';
import { AdvancedPage } from './preferences/advancedPage.js';
import { KeyboardShortcutsPage } from './preferences/keyboardShortcutsPage.js';

export default class TactilePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: Adw.PreferencesWindow) {
        const settings: Gio.Settings = this.getSettings();
        const provider = new Gtk.CssProvider();

        provider.load_from_path(this.dir.get_path() + '/prefs.css');

        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default()!,
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        window.add(new LayoutPage(settings, 1));
        window.add(new LayoutPage(settings, 2));
        window.add(new LayoutPage(settings, 3));
        window.add(new LayoutPage(settings, 4));
        window.add(new KeyboardShortcutsPage(settings));
        window.add(new AdvancedPage(settings));
    }
}

