import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	manifest: {
		manifest_version: 3,
		name: "Filtr",
		version: "1.0",
		description:
			"Analyzes and filters content on websites by running it through an LLM",
		permissions: ["storage"],
		host_permissions: ["https://x.com/*", "https://api.groq.com/*"],
	},
	runner: {
		chromiumProfile: "/tmp/chrome-profile"
	}
});
