# Publishing JSONConfigViewer 0.8.0

Publisher: `WaldekP` (must already exist in VS Code Marketplace).
Repository: https://github.com/wallypi/JSONConfigViewer

## Prerequisites

- Node.js and npm
- VS Code
- Marketplace publisher `WaldekP`

## Verify and package

```bash
npm ci  # if package-lock.json is present; otherwise npm install
npm test
npx @vscode/vsce ls
npx @vscode/vsce package
```

Inspect the VSIX, then install via VS Code Extensions > ... > Install from VSIX and test YAML/JSON editing, Save/Revert, schema selection and textarea.

## Publish

Upload `jsonconfigviewer-0.8.0.vsix` through https://marketplace.visualstudio.com/manage/publishers/ (publisher WaldekP).

Alternatively configure a publisher token and run `npx @vscode/vsce publish`.

## Important

This source bundle has not been tested inside a live VS Code/IBM Bob WebView, and the VSIX has not been built here. Do not publish before completing the steps above.
