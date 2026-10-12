# JSONConfigViewer 0.8.0 — Documentation

## Overview

JSONConfigViewer is a VS Code custom editor for YAML and JSON. It provides a structure tree and an editable form. Select **Reopen Editor With…** to switch between the native editor and JSONConfigViewer.

## Editing

- Select objects and arrays in the structure tree.
- Edit scalar values in the form. Scalar arrays support direct editing and add/remove operations.
- Use Save or Revert in the toolbar; native editor save shortcuts are supported.
- Enable **Show descriptions** for inline YAML comment and schema field help.

## JSON Schema

Schema lookup uses the `configview.schemaFile` workspace setting, local `$schema`, and adjacent `<basename>.schema.json` / `<filename>.schema.json` files. Select a local JSON Schema using the bottom-left schema control. Selecting a schema refreshes the form. Local `$ref` and `allOf` are used to resolve UI metadata. This is not a complete JSON Schema validation engine. Remote schema downloading is not supported.

Schema fields may specify `title`, `description`, `enum`, `minimum`, `maximum`, `multipleOf`, and `x-ui` hints including `widget: textarea`, `rows`, `placeholder`, `readOnly`, `password` and `text`. Multiline string values may also use a textarea automatically.

## Bundled example

`samples/balanced.yaml` with `samples/balanced.schema.json` illustrates nested objects, scalar arrays, enum fields and a textarea-enabled `modernization.notes` field.

## Compatibility and limitations

Internal editor and configuration identifiers (`configview.editor`, `configview.openSample`, `configview.schemaFile`) are retained for compatibility. YAML AST edits attempt to preserve comments, but exact formatting is not guaranteed for every YAML feature. Review diffs for advanced anchors, tags, and complex keys.

## Publication

Publisher: `WaldekP`; repository: `https://github.com/wallypi/JSONConfigViewer`. See `PUBLISHING.md` for the VSIX build and publishing checklist.
