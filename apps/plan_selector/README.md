# Local plan choice UI

The plan selector is a reusable local UI for making product and architecture
decisions one item at a time. Plan catalogs live in `data/<plan-id>.json`;
the first catalog is `chat.json`.

Start it from the coordination repository:

```sh
npm run plan-selector
```

Open `http://127.0.0.1:9092/?plan=chat`. To use another free local port, set
`PLAN_SELECTOR_PORT` before starting the server.

Choices are saved under the ignored `.local/plan-selector/` directory. Saving
does not edit the architecture plan or source code. After the user chooses,
the saved JSON can be reviewed and then applied to the appropriate plan and
implementation sequence. Copy and download actions are also available in the
UI.

The server binds to loopback only, serves only allowlisted app files, accepts
only option IDs listed by the selected plan, and writes answers atomically.
The page has no external asset or font dependency and remains usable without
internet access.
