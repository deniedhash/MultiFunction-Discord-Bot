const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const { getGitAuths } = require('../../github/gitAuthModel');

module.exports = {
    name: 'setrepo',
    description: 'Browse and select a GitHub repo to sync (!setrepo [number])',
    category: 'github',

    async prefixExecute(message, args) {
        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});
        const userData = users[message.author.id];

        if (!userData || !userData.token) {
            return message.reply('You have not set a GitHub token. Use `!setgit <token>` first.');
        }

        const token = userData.token;
        const client = message.client;

        // If no args, list repos
        if (!args[0]) {
            try {
                const { data: repos } = await axios.get('https://api.github.com/user/repos', {
                    headers: { Authorization: `token ${token}` },
                    params: { per_page: 100, sort: 'updated' },
                });

                if (repos.length === 0) {
                    return message.reply('No repositories found on your GitHub account.');
                }

                if (!client.tempRepoList) client.tempRepoList = {};
                client.tempRepoList[message.author.id] = repos;

                const list = repos.map((r, i) => `**${i + 1}.** ${r.full_name}`).join('\n');

                // Split into multiple messages if too long
                const chunks = splitMessage(list, 4000);
                for (const chunk of chunks) {
                    const embed = new EmbedBuilder()
                        .setColor(0x58a6ff)
                        .setTitle('Your GitHub Repositories')
                        .setDescription(chunk)
                        .setFooter({ text: 'Use !setrepo <number> to select a repo' });
                    await message.channel.send({ embeds: [embed] });
                }
            } catch (err) {
                await message.reply('Failed to fetch repos. Check your token.');
            }
            return;
        }

        // With number arg, select repo and show branches
        const num = parseInt(args[0]);
        if (!client.tempRepoList?.[message.author.id]) {
            return message.reply('Run `!setrepo` first to see your repos.');
        }

        const repos = client.tempRepoList[message.author.id];
        if (isNaN(num) || num < 1 || num > repos.length) {
            return message.reply(`Please provide a number between 1 and ${repos.length}.`);
        }

        const selectedRepo = repos[num - 1];

        try {
            const { data: branches } = await axios.get(
                `https://api.github.com/repos/${selectedRepo.full_name}/branches`,
                { headers: { Authorization: `token ${token}` }, params: { per_page: 100 } },
            );

            if (!client.tempBranchSelect) client.tempBranchSelect = {};
            client.tempBranchSelect[message.author.id] = {
                repo: selectedRepo.full_name,
                branches,
                token,
            };

            const list = branches.map((b, i) => `**${i + 1}.** ${b.name}`).join('\n');
            const embed = new EmbedBuilder()
                .setColor(0x58a6ff)
                .setTitle(`Branches for ${selectedRepo.full_name}`)
                .setDescription(list)
                .setFooter({ text: 'Use !setrepo_branch <number> to select a branch' });

            await message.reply({ embeds: [embed] });
        } catch (err) {
            await message.reply('Failed to fetch branches.');
        }
    },
};

function splitMessage(text, maxLength) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    const lines = text.split('\n');
    let current = '';
    for (const line of lines) {
        if (current.length + line.length + 1 > maxLength) {
            chunks.push(current);
            current = line;
        } else {
            current += (current ? '\n' : '') + line;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}
