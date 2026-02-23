const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder,
    ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { bugDeleteDelay } = require('../../config');
const todoModel = require('./todoModel');

const deletionTimers = new Map();

// ── Channel helpers ──

function lockedCategoryOverwrites(guild) {
    return [
        {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
        },
        {
            id: guild.members.me.id,
            allow: [PermissionFlagsBits.SendMessages],
        },
    ];
}

async function ensureTodosCategory(guild) {
    const existing = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'todos',
    );
    if (existing) {
        if (existing.position !== 0) await existing.setPosition(0);
        return existing;
    }
    return guild.channels.create({
        name: 'todos',
        type: ChannelType.GuildCategory,
        position: 0,
        permissionOverwrites: lockedCategoryOverwrites(guild),
    });
}

async function ensureTodosCategoryForRepo(guild, repoName) {
    const shortName = repoName.includes('/') ? repoName.split('/')[1] : repoName;
    const categoryName = `Todos: ${shortName}`;
    const existing = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (existing) {
        if (existing.position !== 0) await existing.setPosition(0);
        return existing;
    }
    return guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        position: 0,
        permissionOverwrites: lockedCategoryOverwrites(guild),
    });
}

async function ensureTodosCategoryGeneral(guild) {
    const categoryName = 'Todos: General';
    const existing = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (existing) {
        if (existing.position !== 0) await existing.setPosition(0);
        return existing;
    }
    return guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        position: 0,
        permissionOverwrites: lockedCategoryOverwrites(guild),
    });
}

async function ensureAddTodoChannel(guild, category) {
    const existing = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === 'add-todo',
    );
    if (existing) return existing;
    return guild.channels.create({
        name: 'add-todo',
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

async function ensureTodoListChannel(guild, category) {
    const existing = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === 'todo-list',
    );
    if (existing) return existing;
    return guild.channels.create({
        name: 'todo-list',
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

async function createTodoChannel(guild, category, todo) {
    let name = `todo-${todo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`;
    const existing = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === name,
    );
    if (existing) {
        name = `${name}-${todo._id.toString().slice(-4)}`;
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

function buildAddTodoEmbed() {
    return new EmbedBuilder()
        .setTitle('TODO Tracker')
        .setDescription('Click the button below to add a TODO.')
        .setColor(0x5865f2);
}

function buildAddTodoButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('todo_add')
            .setLabel('Add TODO')
            .setEmoji('\u{270D}\u{FE0F}')
            .setStyle(ButtonStyle.Primary),
    );
}

function buildRepoSelectMenu(repos) {
    const options = [{
        label: 'General (no repo)',
        value: 'general',
        description: 'Not tied to a repository',
    }];

    for (const r of repos) {
        options.push({
            label: r.repoName,
            value: r.repoName,
            description: r.repoName,
        });
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId('todo_select_repo')
        .setPlaceholder('Select a repository or general')
        .addOptions(options.slice(0, 25));
    return new ActionRowBuilder().addComponents(select);
}

function buildAddTodoModal(repoName) {
    const modal = new ModalBuilder()
        .setCustomId(`todo_modal_add:${repoName}`)
        .setTitle('Add a TODO');

    const titleInput = new TextInputBuilder()
        .setCustomId('todo_title')
        .setLabel('TODO Title')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('todo_description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

    const priorityInput = new TextInputBuilder()
        .setCustomId('todo_priority')
        .setLabel('Priority (low / medium / high)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('medium');

    const dueDateInput = new TextInputBuilder()
        .setCustomId('todo_due_date')
        .setLabel('Due Date (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(priorityInput),
        new ActionRowBuilder().addComponents(dueDateInput),
    );
    return modal;
}

function priorityColor(priority) {
    const colors = { low: 0x57f287, medium: 0xfee75c, high: 0xed4245 };
    return colors[priority] || 0xfee75c;
}

function formatCreator(todo) {
    if (todo.creatorPlatform === 'discord' && todo.createdBy) {
        return `discord: <@${todo.createdBy}>`;
    }
    return `${todo.creatorPlatform || 'unknown'}: ${todo.creatorName}`;
}

function buildTodoDetailEmbed(todo) {
    const embed = new EmbedBuilder()
        .setTitle(`TODO: ${todo.title}`)
        .setDescription(todo.description)
        .setColor(priorityColor(todo.priority))
        .addFields(
            { name: 'Status', value: todo.status.toUpperCase(), inline: true },
            { name: 'Priority', value: todo.priority, inline: true },
            { name: 'Created By', value: formatCreator(todo), inline: true },
        );
    if (todo.repoName) embed.addFields({ name: 'Repository', value: todo.repoName, inline: true });
    if (todo.assignee) embed.addFields({ name: 'Assignee', value: `<@${todo.assignee}>`, inline: true });
    if (todo.dueDate) embed.addFields({ name: 'Due Date', value: `<t:${Math.floor(new Date(todo.dueDate).getTime() / 1000)}:D>`, inline: true });
    if (todo.tags && todo.tags.length > 0) embed.addFields({ name: 'Tags', value: todo.tags.join(', ') });
    embed.setFooter({ text: `ID: ${todo._id}` });
    return embed;
}

function buildTodoChannelButtons(todo) {
    const id = todo._id.toString();
    const isInProgress = todo.status === 'in_progress';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`todo_wip_${id}`)
            .setLabel('In Progress')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isInProgress),
        new ButtonBuilder()
            .setCustomId(`todo_update_${id}`)
            .setLabel('Update')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`todo_resolve_${id}`)
            .setLabel('Done')
            .setStyle(ButtonStyle.Success),
    );
}

function statusEmoji(status) {
    if (status === 'open') return '\u{1F7E1}';
    if (status === 'in_progress') return '\u{1F7E0}';
    if (status === 'done') return '\u2705';
    return '\u2753';
}

function buildTodoListEmbed(todo) {
    const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji(todo.status)} ${todo.title}`)
        .setColor(priorityColor(todo.priority))
        .addFields(
            { name: 'Status', value: todo.status.toUpperCase(), inline: true },
            { name: 'Priority', value: todo.priority, inline: true },
            { name: 'Created By', value: formatCreator(todo), inline: true },
        )
        .setFooter({ text: `ID: ${todo._id}` });
    if (todo.repoName) embed.addFields({ name: 'Repository', value: todo.repoName, inline: true });
    if (todo.channelId) {
        embed.addFields({ name: 'Channel', value: `<#${todo.channelId}>`, inline: true });
    }
    return embed;
}

function buildTodoListComponents(todo) {
    if (todo.status === 'done') {
        const id = todo._id.toString();
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`todo_reopen_${id}`)
                .setLabel('Open Again')
                .setStyle(ButtonStyle.Danger),
        )];
    }
    return [];
}

function buildUpdateModal(todoId) {
    const modal = new ModalBuilder()
        .setCustomId(`todo_modal_update_${todoId}`)
        .setTitle('TODO Update');

    const textInput = new TextInputBuilder()
        .setCustomId('todo_update_text')
        .setLabel('Update')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    return modal;
}

// ── Timer management ──

function scheduleDeletion(client, todoId, delayMs) {
    if (!delayMs) delayMs = bugDeleteDelay * 1000;
    cancelDeletion(todoId);
    console.log(`Scheduling deletion for todo ${todoId} in ${delayMs}ms`);
    const timer = setTimeout(async () => {
        deletionTimers.delete(todoId);
        try {
            const todo = await todoModel.getTodo(todoId);
            console.log(`Deletion timer fired for todo ${todoId}, status: ${todo?.status}, channelId: ${todo?.channelId}`);
            if (!todo || todo.status !== 'done') return;
            const guild = client.guilds.cache.get(todo.guildId);
            if (guild && todo.channelId) {
                const channel = guild.channels.cache.get(todo.channelId);
                if (channel) {
                    await channel.delete('TODO done — auto-cleanup');
                    console.log(`Deleted channel for todo ${todoId}`);
                } else {
                    console.log(`Channel ${todo.channelId} not found in cache for todo ${todoId}`);
                }
            }
            await todoModel.setTodoChannelId(todoId, null);
            await todoModel.setDeletionScheduled(todoId, null);
        } catch (err) {
            console.error(`TODO deletion error for ${todoId}:`, err);
        }
    }, delayMs);
    deletionTimers.set(todoId, timer);
}

function cancelDeletion(todoId) {
    const existing = deletionTimers.get(todoId);
    if (existing) {
        clearTimeout(existing);
        deletionTimers.delete(todoId);
    }
}

// ── Replay ──

async function replayUpdatesToChannel(channel, todo) {
    await todoModel.setReplayComplete(todo._id.toString(), false);

    // Post detail embed + buttons
    const embedMsg = await channel.send({
        embeds: [buildTodoDetailEmbed(todo)],
        components: [buildTodoChannelButtons(todo)],
    });
    await todoModel.setTodoEmbedMessageId(todo._id.toString(), embedMsg.id);

    if (todo.updates.length > 0 || todo.reopenedBy.length > 0) {
        const timeline = [];
        for (const u of todo.updates) {
            timeline.push({ type: 'update', at: new Date(u.createdAt), data: u });
        }
        for (const r of todo.reopenedBy) {
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

    await todoModel.setReplayComplete(todo._id.toString(), true);
}

// ── Update todo-list message ──

async function updateTodoListMessage(client, todo) {
    const guild = client.guilds.cache.get(todo.guildId);
    if (!guild) return;

    const category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'todos',
    );
    if (!category) return;
    const todoListChannel = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === 'todo-list',
    );
    if (!todoListChannel) return;

    const embed = buildTodoListEmbed(todo);
    const components = buildTodoListComponents(todo);

    if (todo.todoListMessageId) {
        try {
            const msg = await todoListChannel.messages.fetch(todo.todoListMessageId);
            await msg.edit({ embeds: [embed], components });
            return;
        } catch (err) {
            console.error('Failed to edit todo-list message, sending new one:', err.message);
        }
    }

    const msg = await todoListChannel.send({ embeds: [embed], components });
    await todoModel.setTodoListMessageId(todo._id.toString(), msg.id);
}

async function backfillTodoList(client, guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    // Only backfill todos for repos that are currently set up (general todos always included)
    const { getGuildRepoList } = require('../github/repoSetupModel');
    const activeRepos = await getGuildRepoList(guildId);
    const activeRepoNames = new Set(activeRepos.map(r => r.repoName));

    const allTodos = (await todoModel.getTodosByGuild(guildId))
        .filter(todo => !todo.repoName || activeRepoNames.has(todo.repoName));

    // 1. Create channels for unfinished todos that don't have one
    for (const todo of allTodos) {
        if (todo.status === 'done') continue;
        const existingChannel = todo.channelId ? guild.channels.cache.get(todo.channelId) : null;
        if (existingChannel) continue;

        const todoId = todo._id.toString();
        const category = todo.repoName
            ? await ensureTodosCategoryForRepo(guild, todo.repoName)
            : await ensureTodosCategoryGeneral(guild);
        const channel = await createTodoChannel(guild, category, todo);
        await todoModel.setTodoChannelId(todoId, channel.id);

        const embedMsg = await channel.send({
            embeds: [buildTodoDetailEmbed(todo)],
            components: [buildTodoChannelButtons(todo)],
        });
        await todoModel.setTodoEmbedMessageId(todoId, embedMsg.id);
    }

    // 2. Post all todos to #todo-list (ordered by creation time, oldest first)
    const sortedTodos = [...allTodos].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (const todo of sortedTodos) {
        // Clear stale todoListMessageId so updateTodoListMessage posts a fresh one
        await todoModel.setTodoListMessageId(todo._id.toString(), null);
        const freshTodo = await todoModel.getTodo(todo._id.toString());
        await updateTodoListMessage(client, freshTodo);
    }
}

// ── External todo creation (API) ──

async function createTodoFromExternal(client, data) {
    const { guildId, repoName, title, description, priority, creatorPlatform, creatorName, createdBy, dueDate, tags } = data;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    const todo = await todoModel.createTodo({
        guildId,
        repoName: repoName || null,
        title,
        description: description || 'No description provided.',
        priority: priority || 'medium',
        createdBy: createdBy || null,
        creatorPlatform: creatorPlatform || 'api',
        creatorName,
        dueDate: dueDate || null,
        tags: Array.isArray(tags) ? tags : [],
    });

    const todoId = todo._id.toString();

    // Only create channels if !addtodo has been set up (shared Todos category exists)
    const todosCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'todos',
    );
    if (!todosCategory) return todo;

    const category = repoName
        ? await ensureTodosCategoryForRepo(guild, repoName)
        : await ensureTodosCategoryGeneral(guild);
    const channel = await createTodoChannel(guild, category, todo);
    await todoModel.setTodoChannelId(todoId, channel.id);

    const embedMsg = await channel.send({
        embeds: [buildTodoDetailEmbed(todo)],
        components: [buildTodoChannelButtons(todo)],
    });
    await todoModel.setTodoEmbedMessageId(todoId, embedMsg.id);

    const updatedTodo = await todoModel.getTodo(todoId);
    await updateTodoListMessage(client, updatedTodo);

    return updatedTodo;
}

module.exports = {
    ensureTodosCategory, ensureTodosCategoryForRepo, ensureTodosCategoryGeneral,
    ensureAddTodoChannel, ensureTodoListChannel, createTodoChannel,
    buildAddTodoEmbed, buildAddTodoButton, buildAddTodoModal, buildRepoSelectMenu,
    buildTodoDetailEmbed, buildTodoChannelButtons,
    buildTodoListEmbed, buildTodoListComponents, buildUpdateModal,
    scheduleDeletion, cancelDeletion,
    replayUpdatesToChannel, updateTodoListMessage, backfillTodoList, createTodoFromExternal,
    deletionTimers,
};
