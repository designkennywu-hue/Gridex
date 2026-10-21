# Index

A local personal knowledge browser with a built-in macOS recorder. Browse project notes, imported documents and small Slack insights; record system audio and microphone together, then transcribe and summarize locally.

## Start

Requires Node.js 22 or newer and access to the shared UI component source. Index consumes that source without vendoring it.

```sh
cd interface
npm ci --ignore-scripts
GRIDWARE_UI_DIR=/absolute/path/to/shared-ui-components npm run build
npm start
```

Open http://127.0.0.1:4180. On macOS, **Open Index.command** starts or reopens the browser after the first build. The server reads knowledge folders beside this README; a fresh clone starts empty.

Create `documents/`, `inbox/`, `sources/`, `topics/`, and `meetings/` as needed. Notes use Markdown and optional YAML metadata; reusable formats live in `templates/`. `AGENTS.md` describes the knowledge workflow. Ingestion and connected-source research run through the project chat; the app does not automatically connect to Slack or Confluence.

## Recording setup (macOS)

Build the native helper with the installed Apple Swift toolchain:

```sh
cd interface/recorder
mkdir -p bin models
swiftc -O -o bin/cord-capture capture/cord-capture.swift
```

Allow the hosting Node process Screen Recording and Microphone access in System Settings. Local transcription also requires `whisper-cli` and a compatible whisper.cpp GGML model in `interface/recorder/models/`; `WHISPER_BIN` and `WHISPER_MODEL` can override their locations. Local summaries require Ollama running with `llama3.1:8b` (or configure `OLLAMA_URL` / `OLLAMA_MODEL`). Models and compiled capture binaries are installed separately and are not stored in Git.

Recording continues while the server runs, even if the browser closes. Processing shows live transcription/summary stages and updates automatically.

## Development

```sh
cd interface
npm test
GRIDWARE_UI_DIR=/absolute/path/to/shared-ui-components npm run build
```

See `interface/README.md` for implementation details and local launch behavior. The summary-writing prompt is a trial awaiting user review; it has not been promoted to agent rules.

## Local data

Git excludes recordings, transcripts, knowledge notes, preserved source snapshots, import indexes, project preferences, screenshots, logs, dependencies, build output and models. These remain on the original Mac. The tracked code reads and writes this local data but does not synchronize it to GitHub.

## Third-party components

The UI requires the separately provided shared UI component library. The Confluence icon retains its attribution in `interface/src/assets/confluence.svg`. The separate lamejs MP3 encoder and its upstream notice are in `interface/recorder/public/vendor/`; see `THIRD-PARTY-NOTICES.md` there.
