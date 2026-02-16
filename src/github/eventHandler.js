const { EmbedBuilder } = require('discord.js');
const store = require('./store');
const { ensureBranchChannel, removeBranchChannel } = require('./channelManager');

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

module.exports = { handleGithubEvent };
