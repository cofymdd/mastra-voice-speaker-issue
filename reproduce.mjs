import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { MastraClient } from "@mastra/client-js";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { MastraVoice } from "@mastra/core/voice";
import { createHonoServer } from "@mastra/deployer/server";

let receivedSpeaker;

class ProbeVoice extends MastraVoice {
	speak(_text, options) {
		receivedSpeaker = options?.speaker;
		return Promise.resolve(Readable.from([Buffer.from("stub-audio")]));
	}
}

const agent = new Agent({
	id: "probe",
	name: "probe",
	instructions: "Minimal voice contract reproduction",
	model: "openai/gpt-4o-mini", // Required agent configuration; the model is never invoked.
	voice: new ProbeVoice(),
});
const app = await createHonoServer(
	new Mastra({ agents: { probe: agent }, logger: false }),
);
const client = new MastraClient({
	baseUrl: "http://mastra.test",
	retries: 0,
	// In-process HTTP transport: the stock server receives the unmodified SDK request.
	fetch: (url, options) => {
		console.log("Request body:", options.body);
		return app.fetch(new Request(url, options));
	},
});

const expectedSpeaker = "test-voice";
const response = await client
	.getAgent("probe")
	.voice.speak("Hello", { speaker: expectedSpeaker });
await response.arrayBuffer();
const sdkSpeaker = receivedSpeaker;
console.log(
	"SDK call: HTTP",
	response.status,
	"expected speaker:",
	expectedSpeaker,
	"received:",
	sdkSpeaker,
);
assert.equal(response.status, 200);

// Control: the same client, server, agent and provider work with top-level speakerId.
const control = await client.request("/agents/probe/voice/speak", {
	method: "POST",
	body: { text: "Hello", speakerId: expectedSpeaker },
	stream: true,
});
await control.arrayBuffer();
console.log(
	"Control: HTTP",
	control.status,
	"received speaker:",
	receivedSpeaker,
);
assert.equal(control.status, 200);
assert.equal(receivedSpeaker, expectedSpeaker);

// This assertion intentionally fails while the SDK/server contract is inconsistent.
assert.equal(sdkSpeaker, expectedSpeaker);
