const { ChannelType } = require('discord.js');

function sanitizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 100);
}

async function setupRepo(guild, repoName) {
    const category = await guild.channels.create({
        name: repoName,
        type: ChannelType.GuildCategory,
    });

    const mainChannel = await guild.channels.create({
        name: 'main',
        type: ChannelType.GuildText,
        parent: category.id,
    });

    return { categoryId: category.id, mainChannelId: mainChannel.id };
}

async function ensureBranchChannel(guild, repoConfig, branchName) {
    if (repoConfig.branches[branchName]) {
        const existing = guild.channels.cache.get(repoConfig.branches[branchName]);
        if (existing) return existing;
    }

    const channel = await guild.channels.create({
        name: sanitizeName(branchName),
        type: ChannelType.GuildText,
        parent: repoConfig.categoryId,
    });

    return channel;
}

async function cleanupRepo(guild, repoConfig) {
    for (const channelId of Object.values(repoConfig.branches)) {
        const channel = guild.channels.cache.get(channelId);
        if (channel) await channel.delete().catch(() => {});
    }

    const category = guild.channels.cache.get(repoConfig.categoryId);
    if (category) await category.delete().catch(() => {});
}

async function removeBranchChannel(guild, repoConfig, branchName) {
    const channelId = repoConfig.branches[branchName];
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (channel) await channel.delete().catch(() => {});
}

module.exports = { setupRepo, ensureBranchChannel, cleanupRepo, removeBranchChannel };
