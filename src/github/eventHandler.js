const { EmbedBuilder, ChannelType } = require('discord.js');
const axios = require('axios');
const store = require('./store');
const { ensureBranchChannel, removeBranchChannel } = require('./channelManager');
const { getRepoSetups } = require('./repoSetupModel');
const { getGitAuths, decrypt } = require('./gitAuthModel');

async function handleGithubEvent(eventType, payload, client) {
    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) return;

    const repoGuilds = await store.getRepoGuilds(repoFullName);
    if (!repoGuilds.length) return;

    for (const repoConfig of repoGuilds) {
        const guild = client.guilds.cache.get(repoConfig.guildId);
        if (!guild) continue;

        const branches = Object.fromEntries(repoConfig.branches);

        try {
            switch (eventType) {
                case 'push':
                    await handlePush(guild, { ...repoConfig, branches }, repoFullName, payload);
                    await autoSyncMirroredFiles(guild, repoFullName, payload);
                    break;
                case 'pull_request':
                    await handlePullRequest(guild, { ...repoConfig, branches }, payload);
                    break;
                case 'issues':
                    await handleIssue(guild, { ...repoConfig, branches }, payload);
                    break;
                case 'create':
                    await handleCreate(guild, { ...repoConfig, branches }, repoFullName, payload);
                    break;
                case 'delete':
                    await handleDelete(guild, { ...repoConfig, branches }, repoFullName, payload);
                    break;
            }
        } catch (err) {
            console.error(`Error handling ${eventType} for ${repoFullName} in guild ${repoConfig.guildId}:`, err);
        }
    }
}

async function handlePush(guild, repoConfig, repoFullName, payload) {
    const branch = payload.ref?.replace('refs/heads/', '');
    if (!branch) return;

    const channel = await ensureBranchChannel(guild, repoConfig, branch);
    await store.setBranch(repoFullName, guild.id, branch, channel.id);

    for (const commit of payload.commits || []) {
        const embed = new EmbedBuilder()
            .setColor(0x2ea44f)
            .setTitle(`Commit to ${branch}`)
            .setURL(commit.url)
            .setDescription(`\`${commit.id.slice(0, 7)}\` ${commit.message}`)
            .setAuthor({
                name: commit.author?.name || 'Unknown',
                iconURL: payload.sender?.avatar_url,
            })
            .setTimestamp(new Date(commit.timestamp || Date.now()));

        await channel.send({ embeds: [embed] });
    }
}

async function handlePullRequest(guild, repoConfig, payload) {
    const pr = payload.pull_request;
    if (!pr) return;

    const action = payload.action;
    if (!['opened', 'closed', 'reopened'].includes(action)) return;

    const merged = action === 'closed' && pr.merged;
    const label = merged ? 'merged' : action;
    const color = merged ? 0x8957e5 : action === 'opened' ? 0x2ea44f : 0xda3633;

    const targetBranch = pr.base?.ref || 'main';
    const channelId = repoConfig.branches[targetBranch] || repoConfig.branches['main'];
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`PR ${label}: ${pr.title}`)
        .setURL(pr.html_url)
        .setDescription(pr.body ? pr.body.slice(0, 200) : '')
        .setAuthor({
            name: pr.user?.login || 'Unknown',
            iconURL: pr.user?.avatar_url,
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

async function handleIssue(guild, repoConfig, payload) {
    const issue = payload.issue;
    if (!issue) return;

    const action = payload.action;
    if (!['opened', 'closed', 'reopened'].includes(action)) return;

    const color = action === 'opened' ? 0x2ea44f : action === 'closed' ? 0xda3633 : 0xf0883e;

    const channelId = repoConfig.branches['main'];
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`Issue ${action}: ${issue.title}`)
        .setURL(issue.html_url)
        .setDescription(issue.body ? issue.body.slice(0, 200) : '')
        .setAuthor({
            name: issue.user?.login || 'Unknown',
            iconURL: issue.user?.avatar_url,
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

async function handleCreate(guild, repoConfig, repoFullName, payload) {
    if (payload.ref_type !== 'branch') return;

    const branch = payload.ref;
    const channel = await ensureBranchChannel(guild, repoConfig, branch);
    await store.setBranch(repoFullName, guild.id, branch, channel.id);

    const embed = new EmbedBuilder()
        .setColor(0x2ea44f)
        .setTitle(`Branch created: ${branch}`)
        .setAuthor({
            name: payload.sender?.login || 'Unknown',
            iconURL: payload.sender?.avatar_url,
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

async function handleDelete(guild, repoConfig, repoFullName, payload) {
    if (payload.ref_type !== 'branch') return;

    const branch = payload.ref;
    await removeBranchChannel(guild, repoConfig, branch);
    await store.removeBranch(repoFullName, guild.id, branch);
}

async function autoSyncMirroredFiles(guild, repoFullName, payload) {
    const branch = payload.ref?.replace('refs/heads/', '');
    if (!branch) return;

    const setupDoc = await getRepoSetups(guild.id);
    const repos = setupDoc.repos || {};
    const repoInfo = repos[repoFullName];

    // Only sync if this repo+branch is mirrored
    if (!repoInfo || repoInfo.branch !== branch) return;

    // Get the token from whoever added the repo
    const authDoc = await getGitAuths(guild.id);
    const users = authDoc.users instanceof Map ? Object.fromEntries(authDoc.users) : (authDoc.users || {});
    const userData = users[repoInfo.addedBy];
    if (!userData || !userData.token) return;

    let token;
    try {
        token = decrypt(userData.token);
    } catch {
        return;
    }

    // Collect changed file paths from all commits
    const changedFiles = new Set();
    for (const commit of payload.commits || []) {
        for (const f of commit.added || []) changedFiles.add(f);
        for (const f of commit.modified || []) changedFiles.add(f);
    }

    if (changedFiles.size === 0) return;

    const category = guild.channels.cache.get(repoInfo.categoryId);
    if (!category) return;

    const channels = guild.channels.cache.filter(
        c => c.parentId === category.id && c.type === ChannelType.GuildText
    );

    for (const filePath of changedFiles) {
        const expectedName = filePath
            .replace(/[^a-zA-Z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase()
            .slice(0, 100);

        const channel = channels.find(c => c.name === expectedName);
        if (!channel) continue;

        try {
            const { data: fileData } = await axios.get(
                `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
                {
                    headers: { Authorization: `token ${token}` },
                    params: { ref: branch },
                },
            );

            const content = Buffer.from(fileData.content || '', 'base64').toString('utf-8');

            // Clear old messages
            const messages = await channel.messages.fetch({ limit: 100 });
            for (const [, msg] of messages) {
                try { await msg.delete(); } catch {}
            }

            // Post updated content
            const header = `**${filePath}** (branch: \`${branch}\`) — *Auto-updated*\n`;
            const chunks = splitContent(content, 1900);
            await channel.send(header);
            for (const chunk of chunks) {
                await channel.send(`\`\`\`\n${chunk}\n\`\`\``);
            }
        } catch (err) {
            console.error(`Auto-sync failed for ${filePath}:`, err.message);
        }
    }
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

module.exports = { handleGithubEvent };
