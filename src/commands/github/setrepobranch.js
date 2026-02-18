const axios = require('axios');
const { EmbedBuilder, ChannelType } = require('discord.js');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');

const MAX_FILES = 50;

module.exports = {
    name: 'setrepo_branch',
    description: 'Select a branch and sync repo files to Discord channels (!setrepo_branch <number>)',
    category: 'github',

    async prefixExecute(message, args) {
        const client = message.client;
        const branchData = client.tempBranchSelect?.[message.author.id];

        if (!branchData) {
            return message.reply('Run `!setrepo` and select a repo first.');
        }

        const num = parseInt(args[0]);
        if (isNaN(num) || num < 1 || num > branchData.branches.length) {
            return message.reply(`Please provide a number between 1 and ${branchData.branches.length}.`);
        }

        const selectedBranch = branchData.branches[num - 1].name;
        const repoName = branchData.repo;
        const token = branchData.token;

        const statusMsg = await message.reply(`Syncing **${repoName}** (branch: \`${selectedBranch}\`)... This may take a moment.`);

        try {
            // Fetch file tree
            const { data: tree } = await axios.get(
                `https://api.github.com/repos/${repoName}/git/trees/${selectedBranch}`,
                { headers: { Authorization: `token ${token}` }, params: { recursive: 1 } },
            );

            const files = tree.tree.filter(f => f.type === 'blob').slice(0, MAX_FILES);

            if (files.length === 0) {
                return statusMsg.edit('No files found in this branch.');
            }

            // Create category
            const category = await message.guild.channels.create({
                name: repoName.replace('/', '-'),
                type: ChannelType.GuildCategory,
            });

            // Create channels for each file
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
                    parent: category.id,
                });

                // Fetch file content
                try {
                    const { data: fileData } = await axios.get(
                        `https://api.github.com/repos/${repoName}/contents/${file.path}`,
                        {
                            headers: { Authorization: `token ${token}` },
                            params: { ref: selectedBranch },
                        },
                    );

                    let content = Buffer.from(fileData.content || '', 'base64').toString('utf-8');
                    const header = `**${file.path}** (branch: \`${selectedBranch}\`)\n`;

                    // Split content into 1900-char chunks to fit Discord's limit
                    const chunks = splitContent(content, 1900);
                    await channel.send(header);
                    for (const chunk of chunks) {
                        await channel.send(`\`\`\`\n${chunk}\n\`\`\``);
                    }
                } catch {
                    await channel.send(`**${file.path}**\n*Could not fetch file contents (may be binary or too large).*`);
                }
            }

            // Save to DB
            const doc = await getRepoSetups(message.guild.id);
            const repos = doc.repos || {};
            repos[repoName] = {
                categoryId: category.id,
                addedBy: message.author.id,
                createdAt: new Date().toISOString(),
                branch: selectedBranch,
            };
            await saveRepoSetups(message.guild.id, repos);

            // Clean up temp state
            delete client.tempBranchSelect[message.author.id];
            delete client.tempRepoList?.[message.author.id];

            await statusMsg.edit(`Synced **${repoName}** (branch: \`${selectedBranch}\`) — ${files.length} file(s) created under **${category.name}**.`);
        } catch (err) {
            console.error('setrepo_branch error:', err);
            await statusMsg.edit('Failed to sync repository. Check permissions and try again.');
        }
    },
};

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
