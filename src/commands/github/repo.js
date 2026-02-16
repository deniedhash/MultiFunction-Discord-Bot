const { EmbedBuilder } = require('discord.js');
const store = require('../../github/store');
const { setupRepo, cleanupRepo } = require('../../github/channelManager');
const { webhookPort } = require('../../../config');

module.exports = {
    name: 'repo',
    aliases: ['gh'],
    description: 'Manage GitHub repo tracking (!repo add/remove/list)',
    category: 'github',

    async prefixExecute(message, args) {
        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'add') {
            await handleAdd(message, args[1]);
        } else if (subcommand === 'remove') {
            await handleRemove(message, args[1]);
        } else if (subcommand === 'list') {
            await handleList(message);
        } else {
            await message.reply('Usage: `!repo add owner/name` | `!repo remove owner/name` | `!repo list`');
        }
    },
};

async function handleAdd(message, repoName) {
    if (!repoName || !repoName.includes('/')) {
        return message.reply('Please provide a valid repo name: `!repo add owner/name`');
    }

    const existing = await store.getRepoGuild(repoName, message.guild.id);
    if (existing) {
        return message.reply(`**${repoName}** is already being tracked in this server.`);
    }

    const { categoryId, mainChannelId } = await setupRepo(message.guild, repoName);

    await store.saveRepoGuild(repoName, message.guild.id, {
        categoryId,
        branches: { main: mainChannelId },
    });

    const port = webhookPort || 3000;
    const embed = new EmbedBuilder()
        .setColor(0x2ea44f)
        .setTitle(`Tracking ${repoName}`)
        .setDescription(
            `Category and #main channel created.\n\n` +
            `**Configure the webhook on GitHub:**\n` +
            `1. Go to \`https://github.com/${repoName}/settings/hooks/new\`\n` +
            `2. Set Payload URL to \`http://<your-server>:${port}/webhook\`\n` +
            `3. Set Content type to \`application/json\`\n` +
            `4. Set Secret to your \`WEBHOOK_SECRET\`\n` +
            `5. Select events: Pushes, Pull requests, Issues, Branch or tag creation, Branch or tag deletion`
        );

    await message.reply({ embeds: [embed] });
}

async function handleRemove(message, repoName) {
    if (!repoName || !repoName.includes('/')) {
        return message.reply('Please provide a valid repo name: `!repo remove owner/name`');
    }

    const repoConfig = await store.getRepoGuild(repoName, message.guild.id);
    if (!repoConfig) {
        return message.reply(`**${repoName}** is not being tracked in this server.`);
    }

    const branches = Object.fromEntries(repoConfig.branches);
    await cleanupRepo(message.guild, { ...repoConfig, branches });
    await store.removeRepoGuild(repoName, message.guild.id);

    await message.reply(`Stopped tracking **${repoName}** and cleaned up channels.`);
}

async function handleList(message) {
    const repos = await store.getGuildRepos(message.guild.id);

    if (repos.length === 0) {
        return message.reply('No repos are being tracked in this server.');
    }

    const embed = new EmbedBuilder()
        .setColor(0x58a6ff)
        .setTitle('Tracked Repositories')
        .setDescription(
            repos.map(repo => {
                const branches = [...repo.branches.keys()].join(', ');
                return `**${repo.repoName}** — branches: ${branches}`;
            }).join('\n')
        );

    await message.reply({ embeds: [embed] });
}
