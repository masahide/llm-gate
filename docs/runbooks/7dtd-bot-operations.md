# 7DTD Bot Operations

## Structured Log Fields

- `requestId`
- `discord.guildId`
- `discord.effectiveChannelId`
- `discord.threadId`
- `discord.messageId`
- `tool.persona`
- `tool.enabledTools`
- `tool.call.name`
- `tool.call.durationMs`
- `http.status`
- `http.durationMs`
- `http.endpoint` (path only)

## Redaction Rules

- `Authorization` is always `[REDACTED]`.
- `SEVEN_DTD_OPS_TOKEN` raw value is never logged.
- Long strings are truncated by `LOG_MAX_CHARS` (default: 2000).

## Circuit Breaker Behavior

- Failure threshold: `SEVEN_DTD_CB_FAILURE_THRESHOLD` (default `5`)
- Open duration: `SEVEN_DTD_CB_OPEN_MS` (default `60000`)
- States: `closed -> open -> half_open -> closed`
- While open, 7DTD API call is skipped and `seven_dtd_circuit_open` is returned.
