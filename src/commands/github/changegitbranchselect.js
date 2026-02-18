const axios = require('axios');
const { ChannelType } = require('discord.js');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');

const MAX_FILES = 50;

module.exports = {
    name: 'changegitbranch_select',
    description: 'Confirm branch switch and re-sync files (!changegitbranch_select <number>)',
    category: 'github',

    async prefixExecute(message, args) {
        const client = message.client;
        const branchData = client.tempChangeBranchSelect?.[message.author.id];

        if (!branchData) {
            return message.reply('Run `!changegitbranch` and select a repo first.');
        }

        const num = parseInt(args[0]);
        if (isNaN(num) || num < 1 || num > branchData.branches.length) {
            return message.reply(`Please provide a number between 1 and ${branchData.branches.length}.`);
        }

        const selectedBranch = branchData.branches[num - 1].name;
        const repoName = branchData.repo;
        const token = branchData.token;

        const statusMsg = await message.reply(`Switching **${repoName}** to branch \`${selectedBranch}\`...`);

        try {
            const setupDoc = await getRepoSetups(message.guild.id);
            const repos = setupDoc.repos || {};
            const repoInfo = repos[repoName];

            if (!repoInfo) {
                return statusMsg.edit('Repo not found in synced repos.');
            }

            // Delete old file channels under the category
            const oldChannels = message.guild.channels.cache.filter(
                c => c.parentId === repoInfo.categoryId && c.type === ChannelType.GuildText
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

                    let content = Buffer.from(fileData.content || '', 'base64').toString('utf-8');
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

            // Update branch in DB
            repos[repoName].branch = selectedBranch;
            await saveRepoSetups(message.guild.id, repos);

            // Clean up temp state
            delete client.tempChangeBranchSelect[message.author.id];
            delete client.tempChangeBranch?.[message.author.id];

            await statusMsg.edit(`Switched **${repoName}** to branch \`${selectedBranch}\` — ${files.length} file(s) synced.`);
        } catch (err) {
            console.error('changegitbranch_select error:', err);
            await statusMsg.edit('Failed to switch branch. Check permissions and try again.');
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
