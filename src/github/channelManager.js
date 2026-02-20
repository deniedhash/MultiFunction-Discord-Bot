const { ChannelType } = require("discord.js");

function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

async function ensureBranchChannel(guild, repoConfig, branchName) {
  const channelName = sanitizeName(branchName);
  const existing = guild.channels.cache.find(
    c => c.parentId === repoConfig.categoryId && c.name === channelName && c.type === ChannelType.GuildText
  );
  if (existing) return existing;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: repoConfig.categoryId,
  });

  return channel;
}

async function removeBranchChannel(guild, repoConfig, branchName) {
  const channelName = sanitizeName(branchName);
  const channel = guild.channels.cache.find(
    c => c.parentId === repoConfig.categoryId && c.name === channelName && c.type === ChannelType.GuildText
  );
  if (channel) await channel.delete().catch(() => {});
}

module.exports = {
  ensureBranchChannel,
  removeBranchChannel,
};
