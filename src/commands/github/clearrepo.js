const { EmbedBuilder, ChannelType } = require('discord.js');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');

module.exports = {
    name: 'clearrepo',
    description: 'Remove a synced repo and its channels (!clearrepo [number])',
    category: 'github',

    async prefixExecute(message, args) {
        const setupDoc = await getRepoSetups(message.guild.id);
        const repos = setupDoc.repos || {};
        const repoNames = Object.keys(repos);

        if (repoNames.length === 0) {
            return message.reply('No synced repos found.');
        }

        const client = message.client;

        // No args: list repos
        if (!args[0]) {
            const list = repoNames.map((name, i) =>
                `**${i + 1}.** ${name} (branch: \`${repos[name].branch}\`)`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x58a6ff)
                .setTitle('Synced Repositories')
                .setDescription(list)
                .setFooter({ text: 'Use !clearrepo <number> to remove a repo' });

            if (!client.tempClearRepo) client.tempClearRepo = {};
            client.tempClearRepo[message.author.id] = { repoNames, repos };

            return message.reply({ embeds: [embed] });
        }

        // With number: remove selected repo
        const num = parseInt(args[0]);
        const tempData = client.tempClearRepo?.[message.author.id];
        if (!tempData) {
            return message.reply('Run `!clearrepo` first to see your synced repos.');
        }

        if (isNaN(num) || num < 1 || num > tempData.repoNames.length) {
            return message.reply(`Please provide a number between 1 and ${tempData.repoNames.length}.`);
        }

        const selectedRepo = tempData.repoNames[num - 1];
        const repoInfo = tempData.repos[selectedRepo];

        // Delete channels and category
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

        // Remove from DB
        const freshDoc = await getRepoSetups(message.guild.id);
        const freshRepos = freshDoc.repos || {};
        delete freshRepos[selectedRepo];
        await saveRepoSetups(message.guild.id, freshRepos);

        // Clean up temp state
        delete client.tempClearRepo[message.author.id];

        await message.reply(`Removed **${selectedRepo}** and cleaned up channels.`);
    },
};
