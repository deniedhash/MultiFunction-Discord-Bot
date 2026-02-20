const axios = require('axios');
const {
    EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType,
} = require('discord.js');
const { getGitAuths, decrypt } = require('../../github/gitAuthModel');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');

const MAX_FILES = 50;

module.exports = {
    name: 'changegitbranch',
    description: 'Switch branch on a synced repo',
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

        // If only one repo, skip straight to branch selection
        let selectedRepo = null;
        if (repoNames.length === 1) {
            selectedRepo = repoNames[0];
            return await showBranchSelect(message, selectedRepo, repos, token);
        }

        // Multiple repos — show repo select menu
        const repoMenu = new StringSelectMenuBuilder()
            .setCustomId('changebranch_repo')
            .setPlaceholder('Select a repository...')
            .addOptions(repoNames.slice(0, 25).map(name => ({
                label: name.length > 100 ? name.slice(0, 97) + '...' : name,
                value: name,
                description: `Current branch: ${repos[name].branch}`,
            })));

        const embed = new EmbedBuilder()
            .setTitle('Switch Branch — Select a Repo')
            .setDescription(`${repoNames.length} synced repo${repoNames.length === 1 ? '' : 's'}.`)
            .setColor(0x58a6ff);

        const reply = await message.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(repoMenu)],
        });

        const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id,
            time: 120_000,
        });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'changebranch_repo') {
                selectedRepo = interaction.values[0];
                collector.stop('repo_selected');
                await interaction.update({
                    embeds: [new EmbedBuilder()
                        .setTitle('Fetching branches...')
                        .setDescription(`**${selectedRepo}**`)
                        .setColor(0xfee75c)],
                    components: [],
                });
                await showBranchSelect(message, selectedRepo, repos, token, reply);
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'repo_selected') return;
            reply.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('Timed Out')
                    .setDescription('Run `!changegitbranch` again to start over.')
                    .setColor(0x99aab5)],
                components: [],
            }).catch(() => {});
        });
    },
};

async function showBranchSelect(message, repoName, repos, token, existingReply) {
    let branches;
    try {
        const { data } = await axios.get(
            `https://api.github.com/repos/${repoName}/branches`,
            { headers: { Authorization: `token ${token}` }, params: { per_page: 100 } },
        );
        branches = data;
    } catch {
        const content = {
            embeds: [new EmbedBuilder().setTitle('Error').setDescription('Failed to fetch branches.').setColor(0xed4245)],
            components: [],
        };
        return existingReply ? existingReply.edit(content) : message.reply(content);
    }

    if (branches.length === 0) {
        const content = {
            embeds: [new EmbedBuilder().setTitle('Error').setDescription('No branches found.').setColor(0xed4245)],
            components: [],
        };
        return existingReply ? existingReply.edit(content) : message.reply(content);
    }

    const currentBranch = repos[repoName].branch;
    const branchMenu = new StringSelectMenuBuilder()
        .setCustomId('changebranch_branch')
        .setPlaceholder('Select a branch...')
        .addOptions(branches.slice(0, 25).map(b => ({
            label: b.name.length > 100 ? b.name.slice(0, 97) + '...' : b.name,
            value: b.name,
            description: b.name === currentBranch ? 'Current branch' : undefined,
        })));

    const embed = new EmbedBuilder()
        .setTitle(`Switch Branch — ${repoName}`)
        .setDescription(`Current branch: \`${currentBranch}\`\n${branches.length} branch${branches.length === 1 ? '' : 'es'} available.`)
        .setColor(0x58a6ff);

    const content = {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(branchMenu)],
    };

    const reply = existingReply
        ? await existingReply.edit(content)
        : await message.reply(content);

    const collector = reply.createMessageComponentCollector({
        filter: (i) => i.user.id === message.author.id,
        time: 120_000,
    });

    collector.on('collect', async (interaction) => {
        if (interaction.customId !== 'changebranch_branch') return;

        const selectedBranch = interaction.values[0];
        collector.stop('completed');

        await interaction.update({
            embeds: [new EmbedBuilder()
                .setTitle('Switching branch...')
                .setDescription(`**${repoName}** → \`${selectedBranch}\``)
                .setColor(0xfee75c)],
            components: [],
        });

        try {
            const repoInfo = repos[repoName];
            let fileCount = 0;

            // Only re-sync file channels if the repo was mirrored
            if (repoInfo.mirrored) {
                // Delete old file channels under the category (except git-updates)
                const oldChannels = message.guild.channels.cache.filter(
                    c => c.parentId === repoInfo.categoryId
                        && c.type === ChannelType.GuildText
                        && c.name !== 'git-updates',
                );
                for (const [, channel] of oldChannels) {
                    try { await channel.delete(); } catch {}
                }

                // Fetch new branch file tree
                const { data: tree } = await axios.get(
                    `https://api.github.com/repos/${repoName}/git/trees/${selectedBranch}`,
                    { headers: { Authorization: `token ${token}` }, params: { recursive: 1 } },
                );

                const files = tree.tree.filter(f => f.type === 'blob').slice(0, MAX_FILES);
                fileCount = files.length;

                // Create new channels with file contents
                for (const file of files) {
                    const channelName = file.path
                        .replace(/[^a-zA-Z0-9-]/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-|-$/g, '')
                        .toLowerCase()
                        .slice(0, 100);

                    const channel = await message.guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        parent: repoInfo.categoryId,
                    });

                    try {
                        const { data: fileData } = await axios.get(
                            `https://api.github.com/repos/${repoName}/contents/${file.path}`,
                            {
                                headers: { Authorization: `token ${token}` },
                                params: { ref: selectedBranch },
                            },
                        );

                        const content = Buffer.from(fileData.content || '', 'base64').toString('utf-8');
                        const header = `**${file.path}** (branch: \`${selectedBranch}\`)\n`;
                        const chunks = splitContent(content, 1900);
                        await channel.send(header);
                        for (const chunk of chunks) {
                            await channel.send(`\`\`\`\n${chunk}\n\`\`\``);
                        }
                    } catch {
                        await channel.send(`**${file.path}**\n*Could not fetch file contents (may be binary or too large).*`);
                    }
                }
            }

            // Update branch in DB
            const freshDoc = await getRepoSetups(message.guild.id);
            const freshRepos = freshDoc.repos || {};
            if (freshRepos[repoName]) {
                freshRepos[repoName].branch = selectedBranch;
                await saveRepoSetups(message.guild.id, freshRepos);
            }

            const desc = repoInfo.mirrored
                ? `**${repoName}** \u2192 \`${selectedBranch}\`\n${fileCount} file${fileCount === 1 ? '' : 's'} synced.`
                : `**${repoName}** \u2192 \`${selectedBranch}\``;

            await reply.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('Branch Switched')
                    .setDescription(desc)
                    .setColor(0x57f287)],
                components: [],
            });
        } catch (err) {
            console.error('changegitbranch error:', err);
            await reply.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('Failed')
                    .setDescription('Failed to switch branch. Check permissions and try again.')
                    .setColor(0xed4245)],
                components: [],
            });
        }
    });

    collector.on('end', (_, reason) => {
        if (reason === 'completed') return;
        reply.edit({
            embeds: [new EmbedBuilder()
                .setTitle('Timed Out')
                .setDescription('Run `!changegitbranch` again to start over.')
                .setColor(0x99aab5)],
            components: [],
        }).catch(() => {});
    });
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
