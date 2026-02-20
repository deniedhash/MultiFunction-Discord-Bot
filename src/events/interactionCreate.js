const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const bugModel = require('../bugs/bugModel');
const bugManager = require('../bugs/bugManager');
const { getGuildRepoList } = require('../github/repoSetupModel');

module.exports = {
    name: Events.InteractionCreate,
    once: false,

    async execute(interaction) {
        try {
            if (interaction.isButton()) {
                await handleButton(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await handleSelectMenu(interaction);
            } else if (interaction.isModalSubmit()) {
                await handleModal(interaction);
            }
        } catch (err) {
            console.error('Interaction error:', err);
            const reply = { content: 'Something went wrong.', flags: 64 };
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply).catch(() => {});
            } else {
                await interaction.reply(reply).catch(() => {});
            }
        }
    },
};

async function handleButton(interaction) {
    const id = interaction.customId;

    if (id === 'bug_add') {
        const repos = await getGuildRepoList(interaction.guild.id);
        if (!repos || repos.length === 0) {
            return interaction.reply({ content: 'No GitHub repos are set up in this server. Ask an admin to use `!setrepo` first.', flags: 64 });
        }
        return interaction.reply({
            content: 'Select a repository for this bug:',
            components: [bugManager.buildRepoSelectMenu(repos)],
            flags: 64,
        });
    }

    if (id.startsWith('bug_wip_')) {
        return handleWip(interaction, id.replace('bug_wip_', ''));
    }

    if (id.startsWith('bug_update_')) {
        const bugId = id.replace('bug_update_', '');
        return interaction.showModal(bugManager.buildUpdateModal(bugId));
    }

    if (id.startsWith('bug_resolve_')) {
        return handleResolve(interaction, id.replace('bug_resolve_', ''));
    }

    if (id.startsWith('bug_reopen_')) {
        return handleReopen(interaction, id.replace('bug_reopen_', ''));
    }
}

async function handleSelectMenu(interaction) {
    const id = interaction.customId;

    if (id === 'bug_select_repo') {
        const repoName = interaction.values[0];
        return interaction.showModal(bugManager.buildAddBugModal(repoName));
    }
}

async function handleModal(interaction) {
    const id = interaction.customId;

    if (id.startsWith('bug_modal_add:')) {
        const repoName = id.split(':').slice(1).join(':');
        return handleBugCreate(interaction, repoName);
    }

    if (id.startsWith('bug_modal_update_')) {
        return handleBugUpdate(interaction, id.replace('bug_modal_update_', ''));
    }
}

// ── Bug creation ──

async function handleBugCreate(interaction, repoName) {
    await interaction.deferReply({ flags: 64 });

    const title = interaction.fields.getTextInputValue('bug_title');
    const description = interaction.fields.getTextInputValue('bug_description') || '';
    const steps = interaction.fields.getTextInputValue('bug_steps') || '';
    const rawSeverity = (interaction.fields.getTextInputValue('bug_severity') || 'normal').toLowerCase().trim();
    const severity = ['low', 'normal', 'high', 'critical'].includes(rawSeverity) ? rawSeverity : 'normal';

    const guild = interaction.guild;

    const bug = await bugModel.createBug({
        guildId: guild.id,
        repoName,
        title,
        description,
        steps,
        severity,
        reportedBy: interaction.user.id,
        reporterPlatform: 'discord',
        reporterName: interaction.user.username,
    });

    const bugId = bug._id.toString();

    const category = await bugManager.ensureBugsCategoryForRepo(guild, repoName);
    const channel = await bugManager.createBugChannel(guild, category, bug);
    await bugModel.setBugChannelId(bugId, channel.id);

    const embedMsg = await channel.send({
        embeds: [bugManager.buildBugDetailEmbed(bug)],
        components: [bugManager.buildBugChannelButtons(bug)],
    });
    await bugModel.setBugEmbedMessageId(bugId, embedMsg.id);

    const updatedBug = await bugModel.getBug(bugId);
    await bugManager.updateBugListMessage(interaction.client, updatedBug);

    await interaction.editReply({ content: `Bug reported! See ${channel}.` });
}

// ── WIP ──

async function handleWip(interaction, bugId) {
    await interaction.deferReply({ flags: 64 });

    const updated = await bugModel.atomicSetWip(bugId, interaction.user.id, interaction.user.username);
    if (!updated) {
        return interaction.editReply({ content: 'This bug is already being worked on or is no longer open.' });
    }

    await interaction.channel.send(`**WIP** — <@${interaction.user.id}> is working on this bug.`);

    try {
        const msg = await interaction.channel.messages.fetch(updated.embedMessageId);
        await msg.edit({
            embeds: [bugManager.buildBugDetailEmbed(updated)],
            components: [bugManager.buildBugChannelButtons(updated)],
        });
    } catch { /* embed message may be gone */ }

    await bugManager.updateBugListMessage(interaction.client, updated);

    await interaction.editReply({ content: 'You claimed this bug as WIP.' });
}

// ── Update ──

async function handleBugUpdate(interaction, bugId) {
    await interaction.deferReply({ flags: 64 });

    const text = interaction.fields.getTextInputValue('bug_update_text');

    const updated = await bugModel.addUpdate(bugId, {
        userId: interaction.user.id,
        username: interaction.user.username,
        text,
    });

    if (!updated) {
        return interaction.editReply({ content: 'Bug not found.' });
    }

    await interaction.channel.send(`**Update** by <@${interaction.user.id}>:\n${text}`);
    await interaction.editReply({ content: 'Update posted.' });
}

// ── Resolve ──

async function handleResolve(interaction, bugId) {
    await interaction.deferReply({ flags: 64 });

    const updated = await bugModel.atomicSetStatus(bugId, 'wip', 'resolved');
    const updatedFromOpen = !updated ? await bugModel.atomicSetStatus(bugId, 'open', 'resolved') : null;
    const bug = updated || updatedFromOpen;

    if (!bug) {
        return interaction.editReply({ content: 'This bug is already resolved or not found.' });
    }

    const reopenRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bug_reopen_${bugId}`)
            .setLabel('Open Again')
            .setStyle(ButtonStyle.Danger),
    );
    await interaction.channel.send({ content: `**Resolved** by <@${interaction.user.id}>.`, components: [reopenRow] });

    try {
        const msg = await interaction.channel.messages.fetch(bug.embedMessageId);
        await msg.edit({
            embeds: [bugManager.buildBugDetailEmbed(bug)],
            components: [],
        });
    } catch { /* embed may be gone */ }

    const { bugDeleteDelay } = require('../../config');
    const delayMs = bugDeleteDelay * 1000;
    await bugModel.setDeletionScheduled(bugId, new Date(Date.now() + delayMs));
    bugManager.scheduleDeletion(interaction.client, bugId, delayMs);

    const freshBug = await bugModel.getBug(bugId);
    await bugManager.updateBugListMessage(interaction.client, freshBug);

    await interaction.editReply({ content: 'Bug marked as resolved. Channel will be cleaned up later.' });
}

// ── Reopen ──

async function handleReopen(interaction, bugId) {
    await interaction.deferReply({ flags: 64 });

    const bug = await bugModel.getBug(bugId);
    if (!bug) {
        return interaction.editReply({ content: 'Bug not found.' });
    }
    if (bug.status !== 'resolved') {
        return interaction.editReply({ content: 'This bug is not resolved.' });
    }

    bugManager.cancelDeletion(bugId);
    await bugModel.clearDeletionScheduled(bugId);

    const updated = await bugModel.addReopenEntry(bugId, {
        userId: interaction.user.id,
        username: interaction.user.username,
    });
    if (!updated) {
        return interaction.editReply({ content: 'Failed to reopen bug.' });
    }

    const guild = interaction.guild;
    const repoName = updated.repoName;
    const category = repoName
        ? await bugManager.ensureBugsCategoryForRepo(guild, repoName)
        : await bugManager.ensureBugsCategory(guild);
    let channel = updated.channelId ? guild.channels.cache.get(updated.channelId) : null;

    if (!channel) {
        channel = await bugManager.createBugChannel(guild, category, updated);
        await bugModel.setBugChannelId(bugId, channel.id);
        const replayBug = await bugModel.getBug(bugId);
        await bugManager.replayUpdatesToChannel(channel, replayBug);
    } else {
        await channel.send(`**Reopened** by <@${interaction.user.id}>.`);
        try {
            const msg = await channel.messages.fetch(updated.embedMessageId);
            await msg.edit({
                embeds: [bugManager.buildBugDetailEmbed(updated)],
                components: [bugManager.buildBugChannelButtons(updated)],
            });
        } catch {
            const embedMsg = await channel.send({
                embeds: [bugManager.buildBugDetailEmbed(updated)],
                components: [bugManager.buildBugChannelButtons(updated)],
            });
            await bugModel.setBugEmbedMessageId(bugId, embedMsg.id);
        }
    }

    const freshBug = await bugModel.getBug(bugId);
    await bugManager.updateBugListMessage(interaction.client, freshBug);

    await interaction.editReply({ content: `Bug has been reopened. See ${channel}.` });
}
