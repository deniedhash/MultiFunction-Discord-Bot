const axios = require('axios');
const { ChannelType } = require('discord.js');
const { getGitAuths } = require('../../github/gitAuthModel');
const { getRepoSetups } = require('../../github/repoSetupModel');

module.exports = {
    name: 'updaterepo',
    description: 'Re-fetch and update file contents for all synced repos',
    category: 'github',

    async prefixExecute(message) {
        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});
        const userData = users[message.author.id];

        if (!userData || !userData.token) {
            return message.reply('You have not set a GitHub token. Use `!setgit <token>` first.');
        }

        const setupDoc = await getRepoSetups(message.guild.id);
        const repos = setupDoc.repos || {};
        const repoNames = Object.keys(repos);

        if (repoNames.length === 0) {
            return message.reply('No synced repos found. Use `!setrepo` to add one.');
        }

        const statusMsg = await message.reply(`Updating ${repoNames.length} repo(s)...`);
        const token = userData.token;
        let updated = 0;

        for (const repoName of repoNames) {
            const repoInfo = repos[repoName];
            const category = message.guild.channels.cache.get(repoInfo.categoryId);
            if (!category) continue;

            try {
                const { data: tree } = await axios.get(
                    `https://api.github.com/repos/${repoName}/git/trees/${repoInfo.branch}`,
                    { headers: { Authorization: `token ${token}` }, params: { recursive: 1 } },
                );

                const files = tree.tree.filter(f => f.type === 'blob').slice(0, 50);

                // Get all text channels under this category
                const channels = message.guild.channels.cache.filter(
                    c => c.parentId === category.id && c.type === ChannelType.GuildText
                );

                for (const [, channel] of channels) {
                    // Find matching file by channel name
                    const matchingFile = files.find(f => {
                        const expected = f.path
                            .replace(/[^a-zA-Z0-9-]/g, '-')
                            .replace(/-+/g, '-')
                            .replace(/^-|-$/g, '')
                            .toLowerCase()
                            .slice(0, 100);
                        return expected === channel.name;
                    });

                    if (!matchingFile) continue;

                    try {
                        const { data: fileData } = await axios.get(
                            `https://api.github.com/repos/${repoName}/contents/${matchingFile.path}`,
                            {
                                headers: { Authorization: `token ${token}` },
                                params: { ref: repoInfo.branch },
                            },
                        );

                        let content = Buffer.from(fileData.content || '', 'base64').toString('utf-8');

                        // Delete old messages and post updated content
                        const messages = await channel.messages.fetch({ limit: 100 });
                        for (const [, msg] of messages) {
                            try { await msg.delete(); } catch {}
                        }

                        const header = `**${matchingFile.path}** (branch: \`${repoInfo.branch}\`) — *Updated*\n`;
                        const chunks = splitContent(content, 1900);
                        await channel.send(header);
                        for (const chunk of chunks) {
                            await channel.send(`\`\`\`\n${chunk}\n\`\`\``);
                        }
                    } catch {}
                }

                updated++;
            } catch (err) {
                console.error(`Failed to update ${repoName}:`, err.message);
            }
        }

        await statusMsg.edit(`Updated ${updated}/${repoNames.length} repo(s).`);
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
