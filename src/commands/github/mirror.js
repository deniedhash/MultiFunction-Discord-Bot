const axios = require('axios');
const {
    EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType,
} = require('discord.js');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');
const { getGitAuths, decrypt } = require('../../github/gitAuthModel');

const MAX_FILES = 50;

module.exports = {
    name: 'mirror',
    description: 'Mirror files from a synced repo into channels',
    category: 'github',

    async prefixExecute(message) {
        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});
        const userData = users[message.author.id];

        if (!userData || !userData.token) {
            return message.reply('You have not set a GitHub token. Use `!setgit <token>` first.');
        }

        const token = decrypt(userData.token);

        const setupDoc = await getRepoSetups(message.guild.id);
        const repos = setupDoc.repos || {};
        const repoNames = Object.keys(repos);

        if (repoNames.length === 0) {
            return message.reply('No synced repos found. Use `!setrepo` to add one.');
        }

        // Single repo — skip selection
        if (repoNames.length === 1) {
            return await mirrorRepo(message, repoNames[0], repos, token);
        }

        // Multiple repos — show select menu
        const menu = new StringSelectMenuBuilder()
            .setCustomId('mirror_repo')
            .setPlaceholder('Select a repository to mirror...')
            .addOptions(repoNames.slice(0, 25).map(name => ({
                label: name.length > 100 ? name.slice(0, 97) + '...' : name,
                value: name,
                description: `${repos[name].branch} — ${repos[name].mirrored ? 'mirrored' : 'not mirrored'}`,
            })));

        const embed = new EmbedBuilder()
            .setTitle('Mirror — Select a Repo')
            .setDescription(`${repoNames.length} synced repo${repoNames.length === 1 ? '' : 's'}.`)
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
            if (interaction.customId !== 'mirror_repo') return;
            const selected = interaction.values[0];
            collector.stop('completed');

            await interaction.update({
                embeds: [new EmbedBuilder()
                    .setTitle('Mirroring...')
                    .setDescription(`**${selected}** (branch: \`${repos[selected].branch}\`)\nThis may take a moment.`)
                    .setColor(0xfee75c)],
                components: [],
            });

            await mirrorRepo(message, selected, repos, token, reply);
        });

        collector.on('end', (_, reason) => {
            if (reason === 'completed') return;
            reply.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('Timed Out')
                    .setDescription('Run `!mirror` again to start over.')
                    .setColor(0x99aab5)],
                components: [],
            }).catch(() => {});
        });
    },
};

async function mirrorRepo(message, repoName, repos, token, existingReply) {
    const repoInfo = repos[repoName];

    if (!repoInfo.categoryId) {
        const msg = 'This repo has no category set up. Try removing and re-adding it with `!setrepo`.';
        return existingReply ? existingReply.edit({ embeds: [errorEmbed(msg)], components: [] }) : message.reply(msg);
    }

    const category = message.guild.channels.cache.get(repoInfo.categoryId);
    if (!category) {
        const msg = 'The category for this repo no longer exists. Try removing and re-adding it.';
        return existingReply ? existingReply.edit({ embeds: [errorEmbed(msg)], components: [] }) : message.reply(msg);
    }

    const statusContent = {
        embeds: [new EmbedBuilder()
            .setTitle('Mirroring...')
            .setDescription(`**${repoName}** (branch: \`${repoInfo.branch}\`)\nThis may take a moment.`)
            .setColor(0xfee75c)],
        components: [],
    };

    const reply = existingReply
        ? await existingReply.edit(statusContent)
        : await message.reply(statusContent);

    try {
        const { data: tree } = await axios.get(
            `https://api.github.com/repos/${repoName}/git/trees/${repoInfo.branch}`,
            { headers: { Authorization: `token ${token}` }, params: { recursive: 1 } },
        );

        const files = tree.tree.filter(f => f.type === 'blob').slice(0, MAX_FILES);

        if (files.length === 0) {
            return reply.edit({
                embeds: [errorEmbed('No files found in this branch.')],
                components: [],
            });
        }

        // Get existing channels under the category
        const existingChannels = message.guild.channels.cache.filter(
            c => c.parentId === category.id && c.type === ChannelType.GuildText,
        );

        for (const file of files) {
            const channelName = file.path
                .replace(/[^a-zA-Z0-9-]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .toLowerCase()
                .slice(0, 100);

            // Reuse existing channel or create new one
            let channel = existingChannels.find(c => c.name === channelName);
            if (!channel) {
                channel = await message.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: category.id,
                });
            }

            // Clear old messages
            const messages = await channel.messages.fetch({ limit: 100 });
            for (const [, msg] of messages) {
                try { await msg.delete(); } catch {}
            }

            // Fetch and post file content
            try {
                const { data: fileData } = await axios.get(
                    `https://api.github.com/repos/${repoName}/contents/${file.path}`,
                    {
                        headers: { Authorization: `token ${token}` },
                        params: { ref: repoInfo.branch },
                    },
                );

                const content = Buffer.from(fileData.content || '', 'base64').toString('utf-8');
                const header = `**${file.path}** (branch: \`${repoInfo.branch}\`)\n`;
                const chunks = splitContent(content, 1900);
                await channel.send(header);
                for (const chunk of chunks) {
                    await channel.send(`\`\`\`\n${chunk}\n\`\`\``);
                }
            } catch {
                await channel.send(`**${file.path}**\n*Could not fetch file contents (may be binary or too large).*`);
            }
        }

        // Mark as mirrored in DB
        const freshDoc = await getRepoSetups(message.guild.id);
        const freshRepos = freshDoc.repos || {};
        if (freshRepos[repoName]) {
            freshRepos[repoName].mirrored = true;
            await saveRepoSetups(message.guild.id, freshRepos);
        }

        await reply.edit({
            embeds: [new EmbedBuilder()
                .setTitle('Mirror Complete')
                .setDescription(
                    `**${repoName}** (branch: \`${repoInfo.branch}\`)\n` +
                    `${files.length} file${files.length === 1 ? '' : 's'} mirrored under **${category.name}**.`,
                )
                .setColor(0x57f287)],
            components: [],
        });
    } catch (err) {
        console.error('mirror error:', err);
        await reply.edit({
            embeds: [errorEmbed('Failed to mirror repository. Check permissions and try again.')],
            components: [],
        });
    }
}

function errorEmbed(desc) {
    return new EmbedBuilder().setTitle('Error').setDescription(desc).setColor(0xed4245);
}

function splitContent(text, maxLength) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + maxLength));
        i += maxLength;
    }
    return chunks;
}
