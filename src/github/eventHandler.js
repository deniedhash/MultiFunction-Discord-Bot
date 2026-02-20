const { EmbedBuilder, ChannelType } = require('discord.js');
const axios = require('axios');
const { getRepoSetups, getGuildsForRepo } = require('./repoSetupModel');
const { getGitAuths, decrypt } = require('./gitAuthModel');
const { createBugFromExternal } = require('../bugs/bugManager');

function getUpdatesChannel(guild, repoConfig) {
    return guild.channels.cache.find(
        c => c.parentId === repoConfig.categoryId && c.name === 'git-updates' && c.type === ChannelType.GuildText
    );
}

async function handleGithubEvent(eventType, payload, client) {
    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) return;

    const repoGuilds = await getGuildsForRepo(repoFullName);
    if (!repoGuilds.length) return;

    for (const repoConfig of repoGuilds) {
        const guild = client.guilds.cache.get(repoConfig.guildId);
        if (!guild) continue;

        try {
            switch (eventType) {
                case 'push':
                    await handlePush(guild, repoConfig, repoFullName, payload);
                    await autoSyncMirroredFiles(guild, repoFullName, payload);
                    break;
                case 'pull_request':
                    await handlePullRequest(guild, repoConfig, payload);
                    break;
                case 'issues':
                    await handleIssue(guild, repoConfig, payload, client);
                    break;
                case 'create':
                    await handleCreate(guild, repoConfig, payload);
                    break;
                case 'delete':
                    await handleDelete(guild, repoConfig, payload);
                    break;
            }
        } catch (err) {
            console.error(`Error handling ${eventType} for ${repoFullName} in guild ${repoConfig.guildId}:`, err);
        }
    }
}

async function handlePush(guild, repoConfig, repoFullName, payload) {
    const channel = getUpdatesChannel(guild, repoConfig);
    if (!channel) return;

    const pusher = payload.sender?.login || payload.pusher?.name || 'Unknown';
    const avatarUrl = payload.sender?.avatar_url;

    for (const commit of payload.commits || []) {
        const embed = new EmbedBuilder()
            .setColor(0x2ea44f)
            .setTitle('\u{1F680} Git Update')
            .setDescription(
                `**${pusher}** made a commit in **${repoFullName}**\n\n` +
                `\u{1F6E0}\u{FE0F} **Branch:** \`${payload.ref}\`\n` +
                `\u{1F4AC} **Commit message:** ${commit.message}\n` +
                `\u{1F517} **Commit URL:** [View Commit](${commit.url})`,
            )
            .setTimestamp(new Date(commit.timestamp || Date.now()));

        if (avatarUrl) embed.setThumbnail(avatarUrl);

        await channel.send({ embeds: [embed] });
    }
}

async function handlePullRequest(guild, repoConfig, payload) {
    const pr = payload.pull_request;
    if (!pr) return;

    const action = payload.action;
    if (!['opened', 'closed', 'reopened'].includes(action)) return;

    const merged = action === 'closed' && pr.merged;
    const label = merged ? 'Merged' : action.charAt(0).toUpperCase() + action.slice(1);
    const emoji = merged ? '\u{1F7E3}' : action === 'opened' ? '\u{1F7E2}' : '\u{1F534}';
    const color = merged ? 0x8957e5 : action === 'opened' ? 0x2ea44f : 0xda3633;

    const channel = getUpdatesChannel(guild, repoConfig);
    if (!channel) return;

    const repoFullName = payload.repository?.full_name || 'Unknown';
    const user = pr.user?.login || 'Unknown';

    const descParts = [
        `**${user}** ${label.toLowerCase()} a PR in **${repoFullName}**\n`,
        `\u{1F4CC} **Title:** ${pr.title || 'Untitled'}`,
        `\u{1F6E0}\u{FE0F} **Branch:** \`${pr.head?.ref || '?'}\` \u2192 \`${pr.base?.ref || '?'}\``,
    ];
    if (pr.body) descParts.push(`\u{1F4AC} **Description:** ${pr.body.slice(0, 200)}`);
    descParts.push(`\u{1F517} **PR URL:** [View PR](${pr.html_url})`);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} Pull Request ${label}`)
        .setDescription(descParts.join('\n'))
        .setTimestamp();

    if (pr.user?.avatar_url) embed.setThumbnail(pr.user.avatar_url);

    await channel.send({ embeds: [embed] });
}

async function handleIssue(guild, repoConfig, payload, client) {
    const issue = payload.issue;
    if (!issue) return;

    const action = payload.action;
    if (!['opened', 'closed', 'reopened'].includes(action)) return;

    const emoji = action === 'opened' ? '\u{1F7E2}' : action === 'closed' ? '\u{1F534}' : '\u{1F7E0}';
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    const color = action === 'opened' ? 0x2ea44f : action === 'closed' ? 0xda3633 : 0xf0883e;

    const channel = getUpdatesChannel(guild, repoConfig);
    if (!channel) return;

    const repoFullName = payload.repository?.full_name || 'Unknown';
    const user = issue.user?.login || 'Unknown';

    const descParts = [
        `**${user}** ${label.toLowerCase()} an issue in **${repoFullName}**\n`,
        `\u{1F4CC} **Title:** ${issue.title || 'Untitled'}`,
    ];
    if (issue.body) descParts.push(`\u{1F4AC} **Description:** ${issue.body.slice(0, 200)}`);
    descParts.push(`\u{1F517} **Issue URL:** [View Issue](${issue.html_url})`);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} Issue ${label}`)
        .setDescription(descParts.join('\n'))
        .setTimestamp();

    if (issue.user?.avatar_url) embed.setThumbnail(issue.user.avatar_url);

    await channel.send({ embeds: [embed] });

    // Auto-create a bug from opened issues
    if (action === 'opened' && client) {
        const repoFullName = payload.repository?.full_name;
        if (repoFullName) {
            try {
                await createBugFromExternal(client, {
                    guildId: guild.id,
                    repoName: repoFullName,
                    title: issue.title,
                    description: issue.body ? issue.body.slice(0, 4000) : 'No description provided.',
                    severity: 'normal',
                    reporterPlatform: 'github',
                    reporterName: issue.user?.login || 'unknown',
                });
            } catch (err) {
                console.error(`Failed to create bug from GitHub issue in guild ${guild.id}:`, err);
            }
        }
    }
}

async function handleCreate(guild, repoConfig, payload) {
    if (payload.ref_type !== 'branch') return;

    const channel = getUpdatesChannel(guild, repoConfig);
    if (!channel) return;

    const repoFullName = payload.repository?.full_name || 'Unknown';
    const user = payload.sender?.login || 'Unknown';

    const embed = new EmbedBuilder()
        .setColor(0x2ea44f)
        .setTitle('\u{1F33F} Branch Created')
        .setDescription(
            `**${user}** created a branch in **${repoFullName}**\n\n` +
            `\u{1F6E0}\u{FE0F} **Branch:** \`${payload.ref}\``,
        )
        .setTimestamp();

    if (payload.sender?.avatar_url) embed.setThumbnail(payload.sender.avatar_url);

    await channel.send({ embeds: [embed] });
}

async function handleDelete(guild, repoConfig, payload) {
    if (payload.ref_type !== 'branch') return;

    const channel = getUpdatesChannel(guild, repoConfig);
    if (!channel) return;

    const repoFullName = payload.repository?.full_name || 'Unknown';
    const user = payload.sender?.login || 'Unknown';

    const embed = new EmbedBuilder()
        .setColor(0xda3633)
        .setTitle('\u{1F5D1}\u{FE0F} Branch Deleted')
        .setDescription(
            `**${user}** deleted a branch in **${repoFullName}**\n\n` +
            `\u{1F6E0}\u{FE0F} **Branch:** \`${payload.ref}\``,
        )
        .setTimestamp();

    if (payload.sender?.avatar_url) embed.setThumbnail(payload.sender.avatar_url);

    await channel.send({ embeds: [embed] });
}

async function autoSyncMirroredFiles(guild, repoFullName, payload) {
    const branch = payload.ref?.replace('refs/heads/', '');
    if (!branch) return;

    const setupDoc = await getRepoSetups(guild.id);
    const repos = setupDoc.repos || {};
    const repoInfo = repos[repoFullName];

    // Only sync if this repo+branch is mirrored
    if (!repoInfo || repoInfo.branch !== branch || !repoInfo.mirrored) return;

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
