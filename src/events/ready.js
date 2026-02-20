const { Events } = require("discord.js");
const { initBugSystem } = require("../bugs/bugStartup");
const StatusManager = require("../utils/statusManager");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    try {
      await initBugSystem(client);
    } catch (err) {
      console.error("Bug system init error:", err);
    }

    // ===== Start Presence System =====
    const statusManager = new StatusManager(client, {
      interval: 20000, // rotate every 20 seconds
    });

    statusManager.start();

    console.log("Status rotation started.");
  },
};
