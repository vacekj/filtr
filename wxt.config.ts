import {defineConfig} from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  autoIcons: {
    baseIconPath: "./assets/icon.jpg"
  },
  manifest: {
    manifest_version: 3,
    name: "Filtr",
    version: "1.0",
    description:
      "Analyzes and filters content oon X",
    permissions: ["storage"],
    host_permissions: ["https://x.com/*"],
  },
  runner: {
    chromiumProfile: "/Users/vacekj/.filtrchromeprofile",
    startUrls: ['x.com'],
    keepProfileChanges: true,
  }
});
