const { EmbedBuilder } = require('discord.js');
const { getRepoSetups } = require('../../github/repoSetupModel');

module.exports = {
    name: 'listrepos',
    description: 'List all synced (file-mirrored) repos in this server',
    category: 'github',

    async prefixExecute(message) {
        const setupDoc = await getRepoSetups(message.guild.id);
        const repos = setupDoc.repos || {};
        const repoNames = Object.keys(repos);

        if (repoNames.length === 0) {
            return message.reply('No synced repos found in this server.');
        }

        const list = repoNames.map(name => {
            const info = repos[name];
            const mirrored = info.mirrored ? 'Mirrored' : 'Not mirrored';
            return `**${name}**\n  Branch: \`${info.branch}\` | ${mirrored} | Added by: <@${info.addedBy}> | <t:${Math.floor(new Date(info.createdAt).getTime() / 1000)}:R>`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(0x58a6ff)
            .setTitle('Synced Repositories')
            .setDescription(list);

        await message.reply({ embeds: [embed] });
    },
};
