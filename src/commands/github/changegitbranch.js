const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const { getGitAuths } = require('../../github/gitAuthModel');
const { getRepoSetups } = require('../../github/repoSetupModel');

module.exports = {
    name: 'changegitbranch',
    description: 'Switch branch on a synced repo (!changegitbranch [number])',
    category: 'github',

    async prefixExecute(message, args) {
        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});
        const userData = users[message.author.id];

        if (!userData || !userData.token) {
            return message.reply('You have not set a GitHub token. Use `!setgit <token>` first.');
        }

        const client = message.client;
        const token = userData.token;

        // If user is in branch-selection mode (already picked a repo), handle that
        const pendingSelect = client.tempChangeBranchSelect?.[message.author.id];
        if (pendingSelect && args[0]) {
            const num = parseInt(args[0]);
            if (isNaN(num) || num < 1 || num > pendingSelect.branches.length) {
                return message.reply(`Please provide a number between 1 and ${pendingSelect.branches.length}.`);
            }
            // Delegate to changegitbranch_select logic
            const selectCmd = client.commands.get('changegitbranch_select');
            return selectCmd.prefixExecute(message, args);
        }

        const setupDoc = await getRepoSetups(message.guild.id);
        const repos = setupDoc.repos || {};
        const repoNames = Object.keys(repos);

        if (repoNames.length === 0) {
            return message.reply('No synced repos found.');
        }

        // Single repo: skip straight to branch listing
        if (repoNames.length === 1) {
            const selectedRepo = repoNames[0];
            return await showBranches(message, client, selectedRepo, token);
        }

        // Multiple repos, no args: list them
        if (!args[0]) {
            const list = repoNames.map((name, i) =>
                `**${i + 1}.** ${name} (branch: \`${repos[name].branch}\`)`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x58a6ff)
                .setTitle('Synced Repositories')
                .setDescription(list)
                .setFooter({ text: 'Use !changegitbranch <number> to select a repo' });

            if (!client.tempChangeBranch) client.tempChangeBranch = {};
            client.tempChangeBranch[message.author.id] = { repoNames, repos };

            return message.reply({ embeds: [embed] });
        }

        // Multiple repos, with number: select repo and show branches
        const num = parseInt(args[0]);
        const tempData = client.tempChangeBranch?.[message.author.id];
        if (!tempData) {
            return message.reply('Run `!changegitbranch` first to see your synced repos.');
        }

        if (isNaN(num) || num < 1 || num > tempData.repoNames.length) {
            return message.reply(`Please provide a number between 1 and ${tempData.repoNames.length}.`);
        }

        const selectedRepo = tempData.repoNames[num - 1];
        await showBranches(message, client, selectedRepo, token);
    },
};

async function showBranches(message, client, repoName, token) {
    try {
        const { data: branches } = await axios.get(
            `https://api.github.com/repos/${repoName}/branches`,
            { headers: { Authorization: `token ${token}` }, params: { per_page: 100 } },
        );

        if (!client.tempChangeBranchSelect) client.tempChangeBranchSelect = {};
        client.tempChangeBranchSelect[message.author.id] = {
            repo: repoName,
            branches,
            token,
        };

        const list = branches.map((b, i) => `**${i + 1}.** ${b.name}`).join('\n');
        const embed = new EmbedBuilder()
            .setColor(0x58a6ff)
            .setTitle(`Branches for ${repoName}`)
            .setDescription(list)
            .setFooter({ text: 'Use !changegitbranch_select <number> to switch branch' });

        await message.reply({ embeds: [embed] });
    } catch (err) {
        await message.reply('Failed to fetch branches.');
    }
}
