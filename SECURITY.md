# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainers via
GitHub's private vulnerability reporting
(`Security → Report a vulnerability` in the repository). Do not open a public
issue with exploit details.

## Scope

- The plugin stores IM credentials through the DSH credentials seam and never
  logs or echoes secret values; settings namespaces declare secret slots that
  are redacted on the wire.
- Inbound senders are fail-closed: empty allowlists deny everyone, the first
  QR scan becomes the owner, and unknown senders are logged, never answered.
- Outbound file sends are restricted to the workspace and configured
  allowlisted directories; symlink escapes are rejected.

## Supported versions

Only the latest release line receives security fixes.
