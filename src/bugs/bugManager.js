const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder,
    ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { bugDeleteDelay } = require('../../config');
const bugModel = require('./bugModel');

const deletionTimers = new Map();

// ── Channel helpers ──

async function ensureBugsCategory(guild) {
    const existing = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'bugs',
    );
    if (existing) return existing;
    return guild.channels.create({ name: 'bugs', type: ChannelType.GuildCategory });
}

async function ensureBugsCategoryForRepo(guild, repoName) {
    const shortName = repoName.includes('/') ? repoName.split('/')[1] : repoName;
    const categoryName = `Bugs: ${shortName}`;
    const existing = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (existing) return existing;
    return guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
}

async function ensureAddBugChannel(guild, category) {
    const existing = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === 'add-bug',
    );
    if (existing) return existing;
    return guild.channels.create({
        name: 'add-bug',
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
            {
                id: guild.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
            },
            {
                id: guild.members.me.id,
                allow: [PermissionFlagsBits.SendMessages],
            },
        ],
    });
}

async function ensureBugListChannel(guild, category) {
    const existing = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === 'bug-list',
    );
    if (existing) return existing;
    return guild.channels.create({
        name: 'bug-list',
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
            {
                id: guild.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
            },
            {
                id: guild.members.me.id,
                allow: [PermissionFlagsBits.SendMessages],
            },
        ],
    });
}

async function createBugChannel(guild, category, bug) {
    let name = `bug-${bug.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`;
    const existing = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === name,
    );
    if (existing) {
        name = `${name}-${bug._id.toString().slice(-4)}`;
    }
    return guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
            {
                id: guild.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
            },
            {
                id: guild.members.me.id,
                allow: [PermissionFlagsBits.SendMessages],
            },
        ],
    });
}

// ── Embed / component builders ──

function buildAddBugEmbed() {
    return new EmbedBuilder()
        .setTitle('Bug Tracker')
        .setDescription('Click the button below to report a new bug.')
        .setColor(0xed4245);
}

function buildAddBugButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bug_add')
            .setLabel('Add Bug')
            .setEmoji('\u{1F41B}')
            .setStyle(ButtonStyle.Danger),
    );
}

function buildRepoSelectMenu(repos) {
    const options = repos.map(r => ({
        label: r.repoName,
        value: r.repoName,
        description: r.repoName,
    }));
    const select = new StringSelectMenuBuilder()
        .setCustomId('bug_select_repo')
        .setPlaceholder('Select a repository')
        .addOptions(options.slice(0, 25));
    return new ActionRowBuilder().addComponents(select);
}

function buildAddBugModal(repoName) {
    const modal = new ModalBuilder()
        .setCustomId(`bug_modal_add:${repoName}`)
        .setTitle('Report a Bug');

    const titleInput = new TextInputBuilder()
        .setCustomId('bug_title')
        .setLabel('Bug Title')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('bug_description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const stepsInput = new TextInputBuilder()
        .setCustomId('bug_steps')
        .setLabel('Steps to Reproduce')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

    const severityInput = new TextInputBuilder()
        .setCustomId('bug_severity')
        .setLabel('Severity (low / normal / high / critical)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('normal');

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(stepsInput),
        new ActionRowBuilder().addComponents(severityInput),
    );
    return modal;
}

function severityColor(severity) {
    const colors = { low: 0x57f287, normal: 0xfee75c, high: 0xe67e22, critical: 0xed4245 };
    return colors[severity] || 0xfee75c;
}

function formatReporter(bug) {
    if (bug.reporterPlatform === 'discord' && bug.reportedBy) {
        return `discord: <@${bug.reportedBy}>`;
    }
    return `${bug.reporterPlatform || 'unknown'}: ${bug.reporterName}`;
}

function buildBugDetailEmbed(bug) {
    const embed = new EmbedBuilder()
        .setTitle(`Bug: ${bug.title}`)
        .setDescription(bug.description)
        .setColor(severityColor(bug.severity))
        .addFields(
            { name: 'Status', value: bug.status.toUpperCase(), inline: true },
            { name: 'Severity', value: bug.severity, inline: true },
            { name: 'Reported By', value: formatReporter(bug), inline: true },
        );
    if (bug.repoName) embed.addFields({ name: 'Repository', value: bug.repoName, inline: true });
    if (bug.steps) embed.addFields({ name: 'Steps to Reproduce', value: bug.steps });
    if (bug.wipUserId) embed.addFields({ name: 'WIP By', value: `<@${bug.wipUserId}>`, inline: true });
    embed.setFooter({ text: `ID: ${bug._id}` });
    return embed;
}

function buildBugChannelButtons(bug) {
    const id = bug._id.toString();
    const isWip = bug.status === 'wip';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bug_wip_${id}`)
            .setLabel('WIP')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isWip),
        new ButtonBuilder()
            .setCustomId(`bug_update_${id}`)
            .setLabel('Update')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`bug_resolve_${id}`)
            .setLabel('Resolved')
            .setStyle(ButtonStyle.Success),
    );
}

function statusEmoji(status) {
    if (status === 'open') return '\u{1F7E1}';
    if (status === 'wip') return '\u{1F7E0}';
    if (status === 'resolved') return '\u2705';
    return '\u2753';
}

function buildBugListEmbed(bug) {
    const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji(bug.status)} ${bug.title}`)
        .setColor(severityColor(bug.severity))
        .addFields(
            { name: 'Status', value: bug.status.toUpperCase(), inline: true },
            { name: 'Severity', value: bug.severity, inline: true },
            { name: 'Reported By', value: formatReporter(bug), inline: true },
        )
        .setFooter({ text: `ID: ${bug._id}` });
    if (bug.repoName) embed.addFields({ name: 'Repository', value: bug.repoName, inline: true });
    if (bug.channelId) {
        embed.addFields({ name: 'Channel', value: `<#${bug.channelId}>`, inline: true });
    }
    return embed;
}

function buildBugListComponents(bug) {
    if (bug.status === 'resolved') {
        const id = bug._id.toString();
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bug_reopen_${id}`)
                .setLabel('Open Again')
                .setStyle(ButtonStyle.Danger),
        )];
    }
    return [];
}

function buildUpdateModal(bugId) {
    const modal = new ModalBuilder()
        .setCustomId(`bug_modal_update_${bugId}`)
        .setTitle('Bug Update');

    const textInput = new TextInputBuilder()
        .setCustomId('bug_update_text')
        .setLabel('Update')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    return modal;
}

// ── Timer management ──

function scheduleDeletion(client, bugId, delayMs) {
    if (!delayMs) delayMs = bugDeleteDelay * 1000;
    cancelDeletion(bugId);
    console.log(`Scheduling deletion for bug ${bugId} in ${delayMs}ms`);
    const timer = setTimeout(async () => {
        deletionTimers.delete(bugId);
        try {
            const bug = await bugModel.getBug(bugId);
            console.log(`Deletion timer fired for bug ${bugId}, status: ${bug?.status}, channelId: ${bug?.channelId}`);
            if (!bug || bug.status !== 'resolved') return;
            const guild = client.guilds.cache.get(bug.guildId);
            if (guild && bug.channelId) {
                const channel = guild.channels.cache.get(bug.channelId);
                if (channel) {
                    await channel.delete('Bug resolved — auto-cleanup');
                    console.log(`Deleted channel for bug ${bugId}`);
                } else {
                    console.log(`Channel ${bug.channelId} not found in cache for bug ${bugId}`);
                }
            }
            await bugModel.setBugChannelId(bugId, null);
            await bugModel.setDeletionScheduled(bugId, null);
        } catch (err) {
            console.error(`Bug deletion error for ${bugId}:`, err);
        }
    }, delayMs);
    deletionTimers.set(bugId, timer);
}

function cancelDeletion(bugId) {
    const existing = deletionTimers.get(bugId);
    if (existing) {
        clearTimeout(existing);
        deletionTimers.delete(bugId);
    }
}

// ── Replay ──

async function replayUpdatesToChannel(channel, bug) {
    await bugModel.setReplayComplete(bug._id.toString(), false);

    // Post detail embed + buttons
    const embedMsg = await channel.send({
        embeds: [buildBugDetailEmbed(bug)],
        components: [buildBugChannelButtons(bug)],
    });
    await bugModel.setBugEmbedMessageId(bug._id.toString(), embedMsg.id);

    if (bug.updates.length > 0 || bug.reopenedBy.length > 0) {
        const timeline = [];
        for (const u of bug.updates) {
            timeline.push({ type: 'update', at: new Date(u.createdAt), data: u });
        }
        for (const r of bug.reopenedBy) {
            timeline.push({ type: 'reopen', at: new Date(r.reopenedAt), data: r });
        }
        timeline.sort((a, b) => a.at - b.at);

        const lines = ['--- **History Replay** ---'];
        for (const entry of timeline) {
            if (entry.type === 'update') {
                lines.push(`**Update** by <@${entry.data.userId}>:\n${entry.data.text}`);
            } else {
                lines.push(`**Reopened** by <@${entry.data.userId}>`);
            }
        }
        lines.push('--- **End of Replay** ---');
        await channel.send(lines.join('\n\n'));
    }

    await bugModel.setReplayComplete(bug._id.toString(), true);
}

// ── Update bug-list message ──

async function updateBugListMessage(client, bug) {
    const guild = client.guilds.cache.get(bug.guildId);
    if (!guild) return;

    const category = await ensureBugsCategory(guild);
    const bugListChannel = await ensureBugListChannel(guild, category);

    // Also ensure #add-bug exists with the button so the system is fully usable
    const addBugChannel = await ensureAddBugChannel(guild, category);
    try {
        const pins = await addBugChannel.messages.fetchPins();
        const botId = guild.members.me?.id;
        const alreadySetUp = botId && pins.some(m => m.author?.id === botId && m.embeds.length > 0);
        if (!alreadySetUp) {
            const msg = await addBugChannel.send({
                embeds: [buildAddBugEmbed()],
                components: [buildAddBugButton()],
            });
            await msg.pin().catch(() => {});
        }
    } catch { /* non-critical — #add-bug setup can be done manually via !addbug */ }

    const embed = buildBugListEmbed(bug);
    const components = buildBugListComponents(bug);

    if (bug.bugListMessageId) {
        try {
            const msg = await bugListChannel.messages.fetch(bug.bugListMessageId);
            await msg.edit({ embeds: [embed], components });
            return;
        } catch (err) {
            console.error('Failed to edit bug-list message, sending new one:', err.message);
        }
    }

    const msg = await bugListChannel.send({ embeds: [embed], components });
    await bugModel.setBugListMessageId(bug._id.toString(), msg.id);
}

// ── External bug creation (API + GitHub Issues) ──

async function createBugFromExternal(client, data) {
    const { guildId, repoName, title, description, steps, severity, reporterPlatform, reporterName, reportedBy } = data;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    const bug = await bugModel.createBug({
        guildId,
        repoName,
        title,
        description: description || 'No description provided.',
        steps: steps || '',
        severity: severity || 'normal',
        reportedBy: reportedBy || null,
        reporterPlatform: reporterPlatform || 'api',
        reporterName,
    });

    const bugId = bug._id.toString();

    const category = await ensureBugsCategoryForRepo(guild, repoName);
    const channel = await createBugChannel(guild, category, bug);
    await bugModel.setBugChannelId(bugId, channel.id);

    const embedMsg = await channel.send({
        embeds: [buildBugDetailEmbed(bug)],
        components: [buildBugChannelButtons(bug)],
    });
    await bugModel.setBugEmbedMessageId(bugId, embedMsg.id);

    const updatedBug = await bugModel.getBug(bugId);
    await updateBugListMessage(client, updatedBug);

    return updatedBug;
}

module.exports = {
    ensureBugsCategory, ensureBugsCategoryForRepo,
    ensureAddBugChannel, ensureBugListChannel, createBugChannel,
    buildAddBugEmbed, buildAddBugButton, buildAddBugModal, buildRepoSelectMenu,
    buildBugDetailEmbed, buildBugChannelButtons,
    buildBugListEmbed, buildBugListComponents, buildUpdateModal,
    scheduleDeletion, cancelDeletion,
    replayUpdatesToChannel, updateBugListMessage, createBugFromExternal,
    deletionTimers,
};
