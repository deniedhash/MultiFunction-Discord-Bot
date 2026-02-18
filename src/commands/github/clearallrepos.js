const { ChannelType } = require('discord.js');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');

module.exports = {
    name: 'clearallrepos',
    description: 'Remove all synced repos and their channels',
    category: 'github',

    async prefixExecute(message) {
        const setupDoc = await getRepoSetups(message.guild.id);
        const repos = setupDoc.repos || {};
        const repoNames = Object.keys(repos);

        if (repoNames.length === 0) {
            return message.reply('No synced repos to clear.');
        }

        // Confirmation via message collector
        await message.reply(`Are you sure you want to remove **${repoNames.length}** synced repo(s) and all their channels? Type \`yes\` to confirm.`);

        const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'yes';
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ['time'] });

            if (collected.size === 0) {
                return message.reply('Cancelled.');
            }

            const statusMsg = await message.reply(`Removing ${repoNames.length} repo(s)...`);

            for (const repoName of repoNames) {
                const repoInfo = repos[repoName];
                if (repoInfo.categoryId) {
                    const channels = message.guild.channels.cache.filter(
                        c => c.parentId === repoInfo.categoryId && c.type === ChannelType.GuildText
                    );
                    for (const [, channel] of channels) {
                        try { await channel.delete(); } catch {}
                    }
                    const category = message.guild.channels.cache.get(repoInfo.categoryId);
                    if (category) {
                        try { await category.delete(); } catch {}
                    }
                }
            }

            await saveRepoSetups(message.guild.id, {});
            await statusMsg.edit(`Removed **${repoNames.length}** synced repo(s) and cleaned up channels.`);
        } catch {
            await message.reply('Confirmation timed out. No repos were removed.');
        }
    },
};
