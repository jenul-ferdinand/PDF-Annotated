# Troubleshooting

## PDF stays on loading

- Reopen the file.
- Check the developer console for webview errors.
- In VS Code Web, prefer smaller files if memory is tight.

## Web build does not load

Check:

- `package.json` has both `main` and `browser`
- web capabilities are enabled
- the web bundle exists in `media/`

## WASM blocked by CSP

If the viewer fails during WASM startup, verify the webview CSP allows:

- `wasm-unsafe-eval`
- worker loading from `blob:`

## Save does not work

- Confirm the PDF is not opened from a read-only source.
- In Web mode, saving support may be limited by the host environment.
- Check the output channel for save errors.

## Headless test issues

Use:

```bash
bun run test-web-headless
```

Do not run browser-based tests without headless mode on a server without a display.
