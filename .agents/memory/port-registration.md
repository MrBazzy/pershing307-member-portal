---
name: Replit port registration
description: How to correctly add ports to .replit [[ports]] so portauthority marks them forwarded
---

The workflow readiness check (`waitForPort`) requires the port to appear in `.replit [[ports]]` with `forwarded: true` and `externalPort` fields from portauthority's SSE feed.

**Rule:** To register a new port for an artifact, use `verifyAndReplaceDotReplit({tempFilePath})` from the code_execution sandbox. Write a temp file with the full `.replit` content including the new `[[ports]]` entry, then call the callback.

**Why:** `verifyAndReplaceArtifactToml` only updates `artifact.toml` — it does NOT update `.replit [[ports]]`. The `createArtifact` callback handles both, but if a port was set manually via `verifyAndReplaceArtifactToml`, the port will never appear in portauthority and the workflow will always fail the readiness check.

**How to apply:** Whenever changing `localPort` in `artifact.toml` (via `verifyAndReplaceArtifactToml`), also call `verifyAndReplaceDotReplit` to add the matching `[[ports]]` entry. Port 3000 is the safe choice — it's in the allowed externalPort list and registered cleanly.
