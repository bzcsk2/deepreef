import { matchesKey, Key } from "./keys";
import type { KeyId } from "./keys";

export type { KeyId };

export interface Keybinding {
  keys: KeyId[];
  name: string;
  description?: string;
}

export interface KeybindingDefinition {
  group: string;
  bindings: Keybinding[];
}

export interface KeybindingsConfig {
  editor?: KeybindingDefinition[];
  input?: KeybindingDefinition[];
  select?: KeybindingDefinition[];
}

export const TUI_KEYBINDINGS: KeybindingsConfig = {
  editor: [
    {
      group: "Navigation",
      bindings: [
        { keys: [Key.up, Key.ctrl("p")], name: "moveUp", description: "Move cursor up" },
        { keys: [Key.down, Key.ctrl("n")], name: "moveDown", description: "Move cursor down" },
        { keys: [Key.left, Key.ctrl("b")], name: "moveLeft", description: "Move cursor left" },
        { keys: [Key.right, Key.ctrl("f")], name: "moveRight", description: "Move cursor right" },
      ],
    },
    {
      group: "Editing",
      bindings: [
        { keys: [Key.backspace], name: "deleteBackward", description: "Delete character before cursor" },
        { keys: [Key.ctrl("d")], name: "deleteForward", description: "Delete character under cursor" },
        { keys: [Key.ctrl("w")], name: "deleteWordLeft", description: "Delete word left" },
        { keys: [Key.ctrl("u")], name: "deleteLineLeft", description: "Delete to start of line" },
        { keys: [Key.ctrl("k")], name: "deleteLineRight", description: "Delete to end of line" },
        { keys: [Key.ctrl("y")], name: "yank", description: "Paste from kill ring" },
        { keys: [Key.ctrl("-")], name: "undo", description: "Undo" },
        { keys: [Key.ctrl("]")], name: "redo", description: "Redo" },
      ],
    },
    {
      group: "Input",
      bindings: [
        { keys: [Key.enter, Key.shift("enter")], name: "newLine", description: "Insert new line" },
        { keys: [Key.tab], name: "indent", description: "Indent" },
        { keys: [Key.ctrl("c")], name: "copy", description: "Copy" },
        { keys: [Key.escape], name: "exit", description: "Exit insert mode" },
      ],
    },
  ],
  input: [
    {
      group: "Input",
      bindings: [
        { keys: [Key.shift("enter")], name: "newline", description: "Insert new line" },
        { keys: [Key.enter], name: "submit", description: "Submit" },
        { keys: [Key.tab], name: "autocomplete", description: "Autocomplete" },
        { keys: [Key.ctrl("c")], name: "copy", description: "Copy" },
      ],
    },
  ],
  select: [
    {
      group: "Selection",
      bindings: [
        { keys: [Key.up, Key.ctrl("p")], name: "moveUp", description: "Move selection up" },
        { keys: [Key.down, Key.ctrl("n")], name: "moveDown", description: "Move selection down" },
        { keys: [Key.pageUp], name: "pageUp", description: "Scroll page up" },
        { keys: [Key.pageDown], name: "pageDown", description: "Scroll page down" },
        { keys: [Key.enter], name: "confirm", description: "Confirm selection" },
        { keys: [Key.escape, Key.ctrl("c")], name: "cancel", description: "Cancel selection" },
      ],
    },
  ],
};

export class KeybindingsManager {
  #config: KeybindingsConfig;

  constructor(config?: KeybindingsConfig) {
    this.#config = config ?? TUI_KEYBINDINGS;
  }

  matches(data: string, keybinding: KeyId): boolean {
    return matchesKey(data, keybinding);
  }

  getKeys(name: string): KeyId[] {
    for (const group of [
      ...(this.#config.editor ?? []),
      ...(this.#config.input ?? []),
      ...(this.#config.select ?? []),
    ]) {
      for (const kb of group.bindings) {
        if (kb.name === name) return kb.keys;
      }
    }
    return [];
  }
}
