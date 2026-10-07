# Mastra Client SDK speaker-option reproduction

Minimal reproduction for [mastra-ai/mastra#26182](https://github.com/mastra-ai/mastra/issues/26182).
The bug occurs at runtime when the Client SDK's `agent.voice.speak()` sends a
speaker override to the Mastra server.

## Run

Requires Node.js 22.13.0 or newer and npm. No API keys, environment variables,
LLM inference, real TTS model, Discord, Python, database, Docker or build step
are needed.

```sh
npm ci
npm start
```

**Expected while the bug is present: `npm start` exits with code 1.** This is
the final assertion detecting the bug, not a setup or installation failure.

## Expected vs. actual behavior

Calling `agent.voice.speak("Hello", { speaker: "test-voice" })` should pass
`{ speaker: "test-voice" }` to the configured voice provider.

Instead, the SDK sends:

```json
{ "text": "Hello", "options": { "speaker": "test-voice" } }
```

The server expects `speakerId` at the top level, so the provider receives
`{ speaker: undefined }`. The endpoint still returns HTTP 200.

The script also sends a control request through the same client's public
`request()` method:

```json
{ "text": "Hello", "speakerId": "test-voice" }
```

That request successfully delivers `test-voice` to the same provider. The
control assertion passes; the assertion for the original SDK call fails.

Typical output:

```text
Request body: {"text":"Hello","options":{"speaker":"test-voice"}}
SDK call: HTTP 200 expected speaker: test-voice received: undefined
Request body: {"text":"Hello","speakerId":"test-voice"}
Control: HTTP 200 received speaker: test-voice
AssertionError [ERR_ASSERTION]:
+ undefined
- 'test-voice'
```

## What this project includes

- One minimal `Agent` with a `MastraVoice` stub returning fixed bytes.
- The real Mastra server built by `createHonoServer()`.
- The real `MastraClient` and its unmodified `voice.speak()` method.
- A fetch transport that forwards a native `Request` directly to the server
  app in memory and logs the body. It does not rewrite JSON or inject a
  speaker. No listening socket or actual network connection is required.

The agent's model string is only required configuration. The script never
calls `generate()` or `stream()`. The returned bytes are dummy data, not real
speech, because the bug concerns parameter forwarding.

## Versions and environment

Direct dependencies are pinned; `package-lock.json` locks transitive dependencies.

| Package           | Version |
| ----------------- | ------- |
| @mastra/client-js | 1.50.0  |
| @mastra/core      | 1.74.0  |
| @mastra/server    | 1.74.0  |
| @mastra/deployer  | 1.74.0  |

Verified in a freshly installed standalone directory with Node.js 24.19.0,
npm 11.17.0, macOS 27.0, arm64. This reproduction does not depend on a
monorepo, npm aliases, Nix or the original application's environment.

## Relevant upstream code

The mismatch was also inspected at commit
`6a4f0bd01016fba8d8dea5159a18c6a400237256`:

- [Client sends text and options](https://github.com/mastra-ai/mastra/blob/6a4f0bd01016fba8d8dea5159a18c6a400237256/client-sdks/client-js/src/resources/agent.ts#L346-L354).
- [Server schema accepts text and top-level speakerId](https://github.com/mastra-ai/mastra/blob/6a4f0bd01016fba8d8dea5159a18c6a400237256/packages/_internals/voice/src/routes/index.ts#L15-L18).
- [Handler forwards speakerId as speaker](https://github.com/mastra-ai/mastra/blob/6a4f0bd01016fba8d8dea5159a18c6a400237256/packages/_internals/voice/src/routes/index.ts#L227).

## Workaround observed

Sending top-level `speakerId` works, as demonstrated by the control request.
A separate application can also use the Client SDK's public `fetch` option to
add this field while preserving `voice.speak()`. That workaround is deliberately
not applied to the failing SDK call here. No dependency patches are included.
