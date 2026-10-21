# Index recording engine

Migrated from Kenny’s local Cord/Recorder on 2026-10-20. `engine.cjs` is instantiated by the Index server and opens no second port. The capture helper, Swift source, MP3 encoder, and transcription models live here; the old Record folder and service are not required. Models were hard-linked on the same disk to avoid duplicating 1.6 GB; removing the old folder does not remove these links. Treat model files as immutable; replace by a new file plus rename when updating.

Recordings and sidecars are saved in the knowledge root’s inbox. Transcription uses the installed whisper-cli and summaries use local Ollama. Closing the browser does not stop a capture; reopening Index recovers the session. The Index server must remain running.

The vendored lamejs encoder is distributed separately; its upstream notice and attribution are beside it in public/vendor/. Native helper rebuilt from capture/cord-capture.swift with swiftc when needed. Models/bin are runtime assets, excluded from Git.
