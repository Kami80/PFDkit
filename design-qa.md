# Equipment symbol design review

Final result: passed

The selected Precision Blueprint and Teaching Cross-Section concept boards were compared with the implemented editor at 1440 × 1000 and with standalone previews of all 16 equipment types. The boards depict five large symbols on a white sheet; the implementation adapts their visual language to the existing 120 × 80 symbol frame and registered port positions, so it is not a pixel-for-pixel reproduction of the boards. The remaining symbols follow the same line-art system.

- Precision uses restrained outlines; teaching adds teal internal details to applicable equipment.
- Equipment names, stream labels and connection points remain legible in the editor. Dark canvas review exposed low-contrast equipment cards; the card colors were adjusted and the result reviewed again.
- Both 16-symbol previews were inspected for clipping and legibility; they include all registered equipment types.
- The selected style survives JSON export and shared-document publication. SVG, PNG and PDF exports were exercised for both styles, and the exported artwork was visually inspected.
- The existing original style remains the default for older documents. Preserving the existing port positions constrains the proportions of tall equipment such as columns and reactors.

Review captures are in `.artifacts/editor-precision.png`, `.artifacts/editor-teaching.png`, `.artifacts/editor-teaching-dark-final.png`, and `.artifacts/symbol-all-{precision,teaching}-final.png`.
