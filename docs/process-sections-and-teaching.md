# Process sections and teaching

PFDkit keeps one canonical equipment and stream graph. Process sections organize that graph; saved lessons explain it. Neither hierarchy nor presentation performs process calculations.

## Create and reuse a section

1. Select connected equipment with Ctrl/⌘ + click. Open **Teaching and sections**, give the section a name, then choose **Group selected equipment**.
2. Choose **Enter** beside its name. Breadcrumbs return to its parent or **Flowsheet**. Each scope remembers its viewport and selection for this editing session.
3. Boundary streams remain the original stream objects, with their original identifiers, conditions and endpoints. The boundary list describes the internal equipment port and flow direction. Outside endpoint equipment appears as read-only context. Crossing streams can still be selected, edited, reconnected or deleted.
4. Inside a section, select directly owned equipment and group again to create a child. Four containment levels are supported. A disconnected selection or an invalid deeper section receives an explanation and leaves the document/history unchanged.
5. **Extract** removes the section container. Its direct equipment and child sections move to its parent. Equipment, streams and presentation references keep their identifiers. Teaching references to the removed section remain as visible draft warnings so an author can choose replacements.
6. **Duplicate** duplicates a whole section, including its descendants, internal streams, ports, geometry, styles, annotations and lecture references. Every copied object receives a fresh identifier. Original external streams remain attached to the original section; connect the duplicate's available boundary equipment ports to its new surroundings.
7. **Save template** stores a portable section document in this browser. **Insert template** adds it under the current section with fresh identifiers. Templates persist across page reloads. Native JSON remains the portable whole-document format; browser template storage can be unavailable or cleared by the browser.

Standard equipment copy/paste continues to copy the selected equipment and its internal streams into the current level. Use the section's **Duplicate** action to preserve its nested hierarchy and teaching content.

An empty section remains an editable organizational container. Deleting equipment removes its section memberships and attached streams, and updates all affected boundaries. Extract the empty section when it is no longer needed. Undo/redo restores grouping, extraction, insertion and deletion as document commands.

## Containment and boundaries

The additive `engineering.sections` array contains typed `ProcessSection` records:

```json
{
  "id": "heating-section",
  "name": "Feed heating",
  "parentId": null,
  "equipmentIds": ["pump-1", "exchanger-1"],
  "boundaryPorts": [
    {
      "id": "feed-boundary",
      "streamId": "stream-1",
      "internalEndpoint": { "equipmentId": "pump-1", "portId": "in" },
      "direction": "in",
      "kind": "material"
    }
  ]
}
```

Direct membership is disjoint. A parent's effective membership includes all descendants. Every crossing stream has exactly one boundary mapping per crossed section. Mapping identities survive edits when the same stream still crosses the same section. Reconnection and deletion refresh the mappings in the same undoable command.

Missing equipment or parents, recursive containment, excessive depth, duplicate identifiers, duplicate memberships, and incorrect/missing boundary mappings are structural errors in both Python and TypeScript. Process recycle loops are allowed: stream connectivity and section containment are independent graphs.

Section templates preserve annotations targeted at included equipment, streams or sections. Untargeted annotations inside the section figure bounds are included as well: equipment bounds plus 40 units left, 40 units right beyond the 160-unit node width, 80 units above, and 180 units below the node origin. An untargeted note elsewhere belongs to the surrounding diagram. Internal presentation-step targets are remapped; references outside the template are omitted. Arbitrary extension metadata is preserved as data; executable extension code is never loaded from a document.

## Build a lecture

1. Select the process objects to discuss, or enter a section and clear the selection. Open **Teaching and sections** and choose **Add step from selection**. An empty focus means the full diagram.
2. Enter the title and lecture notes. **Use current focus** replaces the saved focus with the current selection or current section. Choose **Move step earlier** to reorder the lecture.
3. **Reveal selection at step** schedules selected objects for that step. Objects scheduled later are hidden until their reveal; other objects form the baseline. Reveals accumulate as the presenter moves forward and are recomputed when moving backward. A revealed stream also reveals its endpoint equipment. Annotations targeting hidden objects stay hidden.
4. Choose an optional supported exchanger or column explorer for a step. During presentation, **Inspect [tag]** opens its shared educational explorer with configuration editing hidden.
5. Add annotations as notes, callouts, arrows or component labels. They target the last selected object or current section; otherwise they are positioned on the diagram. Edit their text and coordinates, adjust arrow endpoints, and use **Show** to control their saved visibility. Visible annotations are captured in new steps and revealed with their first referencing step.

Provenance is explicit: **conceptual** explains principles, **manual** describes supplied specifications, **illustrative** identifies teaching examples, and **calculated** labels explicitly supplied external results. The author is responsible for the stated calculation source and validity; PFDkit does not calculate engineering results. Use lecture notes and document attribution to record the calculation method/source where applicable.

## Present and return to editing

**Present** opens an isolated presentation view with editing controls hidden. **Fullscreen** requests browser fullscreen when supported. **Previous step**, **Next step**, arrow keys, Page Up/Down and Home/End navigate. Space advances when the presentation surface has focus; focused buttons keep their normal Space behavior. **Show notes** or **N** reveals lecture notes, which start hidden. **Diagram overview** switches between the full currently revealed diagram and focused targets.

Focused equipment/streams use a contrasting thicker outline and the figure fits the saved targets. Section targets fit their descendant equipment. Supported equipment inspection is read-only. Deleted targets produce a clear notice, while remaining diagram content and saved notes stay usable. An empty lesson presents the full diagram and explains how to add steps.

**Exit presentation** or Escape restores the editing workspace. Browser Escape from native fullscreen also closes presentation. The editor's document, engineering values, history, section scope, selection, viewport and intended annotation visibility are preserved. Reveal state, focused figure, lecture-note visibility and inspection navigation are temporary. Keyboard focus is trapped in the presentation/dialog and returns to the invoking control; reduced-motion preferences are respected.

## Sample walkthrough and verification

Start with `examples/valid-process.json`. Group its pump and exchanger as **Feed heating**, then group the exchanger inside it as **Heat exchange**. Add an illustrative annotation targeted at the exchanger. Create three steps: full PFD, **Feed heating** section, and exchanger with its explorer selected. Present forward/back, show notes, inspect the exchanger, close the explorer, and exit to the nested editing scope. Export/reopen native JSON; all canonical streams and saved content should remain identical.

The committed `apps/web/tests/m3.spec.ts` exercises a nested section whose identifier is the literal `root`, the three-step lecture, read-only explorer inspection, context restoration, byte-identical native export, and reopening. `apps/web/src/lib/hierarchy-teaching.test.ts` covers grouping, extraction, boundary preservation, duplicate/template remapping, deletion/undo, namespace-safe navigation, legacy defaults and reversible reveal state. `packages/pfd-core/tests/test_hierarchy_teaching.py` covers equivalent structural validation, legacy normalization and allowed recycle loops.

## Compatibility

The document version remains `1.0.0`: the new typed fields are additive with empty defaults. An older document, including a fully populated 1.0 document without these fields, opens with `engineering.sections`, `education.annotations` and `education.steps` normalized to empty arrays. Current exports include the arrays. No opaque metadata is used as a substitute for validating section or teaching references. An older application that forbids unknown fields cannot open the extended document; use a current PFDkit release for these features.
