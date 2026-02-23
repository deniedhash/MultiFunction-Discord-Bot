const { PermissionFlagsBits } = require('discord.js');
const {
    ensureTodosCategory, ensureAddTodoChannel, ensureTodoListChannel,
    buildAddTodoEmbed, buildAddTodoButton, backfillTodoList,
} = require('../../todos/todoManager');

module.exports = {
    name: 'addtodo',
    description: 'Set up TODO tracking channels (todos category, #add-todo, #todo-list)',
    category: 'Todos',

    async prefixExecute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('You need the **Manage Channels** permission to use this command.');
        }

        const guild = message.guild;
        const category = await ensureTodosCategory(guild);
        const addTodoChannel = await ensureAddTodoChannel(guild, category);
        await ensureTodoListChannel(guild, category);

        // Check if the add-todo channel already has a pinned todo embed
        const pinsResult = await addTodoChannel.messages.fetchPins();
        const pins = pinsResult.items || pinsResult;
        const botId = guild.members.me?.id;
        const alreadySetUp = botId && [...pins.values()].some(m => m.author?.id === botId && m.embeds.length > 0);

        if (!alreadySetUp) {
            const msg = await addTodoChannel.send({
                embeds: [buildAddTodoEmbed()],
                components: [buildAddTodoButton()],
            });
            await msg.pin();
        }

        // Backfill any todos that aren't in #todo-list yet
        await backfillTodoList(message.client, guild.id);

        await message.reply(`TODO tracking is ready! Head to ${addTodoChannel} to add TODOs.`);
    },
};
