const { Client, Collection, GatewayIntentBits } = require("discord.js");
const mongoose = require("mongoose");
const { token, mongoUri } = require("./config");
const commandHandler = require("./src/handlers/commandHandler");
const eventHandler = require("./src/handlers/eventHandler");
const { startWebhookServer } = require("./src/github/webhookServer");
const { initBugSystem } = require("./src/bugs/bugStartup");
const { initFeatureSystem } = require("./src/features/featureStartup");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

//test

client.commands = new Collection();

commandHandler(client);
eventHandler(client);

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("Connected to MongoDB");
    return client.login(token);
  })
  .then(() => {
    startWebhookServer(client);
    initBugSystem(client);
    initFeatureSystem(client);
  })
  .catch((err) => {
    console.error("Startup error:", err);
    process.exit(1);
  });
