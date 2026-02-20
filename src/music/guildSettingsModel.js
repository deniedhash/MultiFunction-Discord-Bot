const mongoose = require("mongoose");

const guildSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  volume: { type: Number, default: 1.0 },
});

const GuildSettings = mongoose.model("GuildSettings", guildSettingsSchema);

async function getVolume(guildId) {
  const doc = await GuildSettings.findOne({ guildId });
  return doc ? doc.volume : 1.0;
}

async function saveVolume(guildId, volume) {
  await GuildSettings.findOneAndUpdate(
    { guildId },
    { guildId, volume },
    { upsert: true },
  );
}

module.exports = { getVolume, saveVolume };
