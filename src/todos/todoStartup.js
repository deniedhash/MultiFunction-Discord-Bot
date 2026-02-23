const todoModel = require('./todoModel');
const todoManager = require('./todoManager');

async function initTodoSystem(client) {
    // 1. Restore deletion timers for done todos with scheduled deletions
    const pendingDeletions = await todoModel.getPendingDeletions();
    for (const todo of pendingDeletions) {
        const remaining = new Date(todo.deletionScheduledAt).getTime() - Date.now();
        if (remaining <= 0) {
            // Already past due — delete immediately
            todoManager.scheduleDeletion(client, todo._id.toString(), 1);
        } else {
            todoManager.scheduleDeletion(client, todo._id.toString(), remaining);
        }
    }
    if (pendingDeletions.length > 0) {
        console.log(`Restored ${pendingDeletions.length} todo deletion timer(s).`);
    }

    // 2. Finish incomplete replays
    const incompleteReplays = await todoModel.getIncompleteReplays();
    for (const todo of incompleteReplays) {
        const guild = client.guilds.cache.get(todo.guildId);
        if (!guild) continue;
        const channel = todo.channelId ? guild.channels.cache.get(todo.channelId) : null;
        if (!channel) continue;
        try {
            await todoManager.replayUpdatesToChannel(channel, todo);
        } catch (err) {
            console.error(`Failed to finish replay for todo ${todo._id}:`, err);
        }
    }
    if (incompleteReplays.length > 0) {
        console.log(`Finished ${incompleteReplays.length} incomplete todo replay(s).`);
    }
}

module.exports = { initTodoSystem };
