const {
    EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType,
} = require('discord.js');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');

module.exports = {
    name: 'unmirror',
    description: 'Remove mirrored file channels from a repo (keeps category and #git-updates)',
    category: 'github',

    async prefixExecute(message) {
        const setupDoc = await getRepoSetups(message.guild.id);
        const repos = setupDoc.repos || {};
        const mirroredNames = Object.keys(repos).filter(name => repos[name].mirrored);

        if (mirroredNames.length === 0) {
            return message.reply('No mirrored repos found.');
        }

        // Single mirrored repo — skip selection
        if (mirroredNames.length === 1) {
            return await unmirrorRepo(message, mirroredNames[0], repos);
        }

        // Multiple — show select menu
        const menu = new StringSelectMenuBuilder()
            .setCustomId('unmirror_repo')
            .setPlaceholder('Select a repository to unmirror...')
            .addOptions(mirroredNames.slice(0, 25).map(name => ({
                label: name.length > 100 ? name.slice(0, 97) + '...' : name,
                value: name,
                description: `Branch: ${repos[name].branch}`,
            })));

        const embed = new EmbedBuilder()
            .setTitle('Unmirror — Select a Repo')
            .setDescription(`${mirroredNames.length} mirrored repo${mirroredNames.length === 1 ? '' : 's'}.`)
            .setColor(0x58a6ff);

        const reply = await message.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(menu)],
        });

        const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id,
            time: 120_000,
        });

        collector.on('collect', async (interaction) => {
            if (interaction.customId !== 'unmirror_repo') return;
            const selected = interaction.values[0];
            collector.stop('completed');

            await interaction.update({
                embeds: [new EmbedBuilder()
                    .setTitle('Removing mirrored channels...')
                    .setDescription(`**${selected}**`)
                    .setColor(0xfee75c)],
                components: [],
            });

            await unmirrorRepo(message, selected, repos, reply);
        });

        collector.on('end', (_, reason) => {
            if (reason === 'completed') return;
            reply.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('Timed Out')
                    .setDescription('Run `!unmirror` again to start over.')
                    .setColor(0x99aab5)],
                components: [],
            }).catch(() => {});
        });
    },
};

async function unmirrorRepo(message, repoName, repos, existingReply) {
    const repoInfo = repos[repoName];

    if (!repoInfo.categoryId) {
        const content = { embeds: [errorEmbed('No category found for this repo.')], components: [] };
        return existingReply ? existingReply.edit(content) : message.reply(content);
    }

    const statusContent = {
        embeds: [new EmbedBuilder()
            .setTitle('Removing mirrored channels...')
            .setDescription(`**${repoName}**`)
            .setColor(0xfee75c)],
        components: [],
    };

    const reply = existingReply
        ? await existingReply.edit(statusContent)
        : await message.reply(statusContent);

    try {
        // Delete all text channels under the category except #git-updates
        const fileChannels = message.guild.channels.cache.filter(
            c => c.parentId === repoInfo.categoryId
                && c.type === ChannelType.GuildText
                && c.name !== 'git-updates',
        );

        let deleted = 0;
        for (const [, channel] of fileChannels) {
            try {
                await channel.delete();
                deleted++;
            } catch {}
        }

        // Mark as not mirrored in DB
        const freshDoc = await getRepoSetups(message.guild.id);
        const freshRepos = freshDoc.repos || {};
        if (freshRepos[repoName]) {
            freshRepos[repoName].mirrored = false;
            await saveRepoSetups(message.guild.id, freshRepos);
        }

        await reply.edit({
            embeds: [new EmbedBuilder()
                .setTitle('Unmirror Complete')
                .setDescription(
                    `**${repoName}**\n` +
                    `Removed ${deleted} file channel${deleted === 1 ? '' : 's'}. Category and #git-updates kept.`,
                )
                .setColor(0x57f287)],
            components: [],
        });
    } catch (err) {
        console.error('unmirror error:', err);
        await reply.edit({
            embeds: [errorEmbed('Failed to unmirror. Check permissions and try again.')],
            components: [],
        });
    }
}

function errorEmbed(desc) {
    return new EmbedBuilder().setTitle('Error').setDescription(desc).setColor(0xed4245);
}
