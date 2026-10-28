# Editing diagrams

Use the equipment search and category filter to find one of the ten catalog types. Click or press Enter on a palette item to place it near the canvas center; drag it onto the canvas for a specific location. Within the palette, Up/Down and Home/End move keyboard focus. A search with no matches explains how to recover.

Click an object to inspect it. Ctrl-click (Windows/Linux) or Command-click (macOS) toggles additional objects; Shift-drag selects a region. Dragging a selected group moves its equipment together and retains stream references. The inspector summarizes mixed selections rather than silently editing one object's engineering values. Style controls can apply the same appearance to the whole selection.

## History and shortcuts

| Action                                | Shortcut                                      |
| ------------------------------------- | --------------------------------------------- |
| Undo                                  | Ctrl/Command + Z                              |
| Redo                                  | Ctrl/Command + Shift + Z, or Ctrl/Command + Y |
| Copy                                  | Ctrl/Command + C                              |
| Paste                                 | Ctrl/Command + V                              |
| Duplicate                             | Ctrl/Command + D                              |
| Select all diagram objects            | Ctrl/Command + A                              |
| Delete selection and attached streams | Delete or Backspace                           |
| Move focused selection                | Arrow keys                                    |
| Commit a property field               | Enter or leave the field                      |
| Cancel the active field               | Escape                                        |

Text fields retain their normal copy/paste and deletion behavior. Dialogs own their keyboard events so deleting text or pressing Escape cannot delete objects behind an explorer/export dialog. Undo/redo applies document commands; text edits in one focused field and a complete drag are each one history entry. The history retains the most recent 100 commands. A successful new edit clears redo. Opening/importing another project starts a fresh history; undo never crosses project boundaries.

## Copying and references

Copying equipment includes streams whose two endpoints are in the copied group. Copying a stream also copies its endpoint equipment. Paste allocates fresh equipment/stream IDs, remaps endpoints, offsets the layout by 20 document units, assigns unique tags, and copies configuration, unknown metadata and per-object styles. Global component identities are reused where compatible; collisions in another document receive new IDs with composition references remapped. Arbitrary extension metadata is preserved without guessing that opaque strings are references.

Deletion removes selected equipment, its attached streams, its layout and known object-style references as one command. Undo restores the complete document, including those references and styles.

## Connections and coordinates

Drag an outlet handle onto a compatible inlet, or use **Connect ports** for the keyboard path. Material and energy ports are labeled and use distinct stream patterns. Unconnected required ports remain editable draft warnings. A rejected connection leaves the document intact.

Select a stream to edit its label, operating values and units. Drag an endpoint updater to reconnect it, or use **Reconnect endpoints** in its inspector. Reconnection retains the stream ID, label, quantities, composition and metadata. Capacity validation replaces the old connection while checking the candidate, so reconnecting a stream to its existing port remains valid.

The canvas shows a 20-unit grid; the grid control toggles snapping. With snapping enabled, new placement and dragging snap to that grid, and keyboard movement advances 20 units. With it disabled, keyboard movement advances one unit. Zoom changes the display scale rather than engineering data or document coordinates.

Streams use basic orthogonal paths with square corners and visible flow arrows. The renderer and SVG export share port geometry and routing parameters. Routing does not avoid equipment or labels automatically; move equipment to resolve overlaps. Automatic layout, obstacle avoidance, advanced alignment, reusable grouped subflowsheets and a generalized equipment explorer remain outside this release.

Numbers commit when a field loses focus or Enter is pressed; blank operating values remain unknown rather than zero. Invalid numbers show inline feedback and restore the previous value. Unit changes convert the latest entered quantity. Exchanger configuration edits retain its four stable circuit ports; double-click or use **Explore heat exchanger** to inspect the supported illustration.

The editing tests cover form commit/cancel and undo, native multi-selection and group movement, copy/paste/delete recovery, actual endpoint reconnection, and the original create/edit/export/reopen workflow. See the milestone acceptance record for the final clean-install and browser verification results.
