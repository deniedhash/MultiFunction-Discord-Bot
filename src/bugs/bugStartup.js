const bugModel = require('./bugModel');
const bugManager = require('./bugManager');

async function initBugSystem(client) {
    // 1. Restore deletion timers for resolved bugs with scheduled deletions
    const pendingDeletions = await bugModel.getPendingDeletions();
    for (const bug of pendingDeletions) {
        const remaining = new Date(bug.deletionScheduledAt).getTime() - Date.now();
        if (remaining <= 0) {
            // Already past due — delete immediately
            bugManager.scheduleDeletion(client, bug._id.toString(), 1);
        } else {
            bugManager.scheduleDeletion(client, bug._id.toString(), remaining);
        }
    }
    if (pendingDeletions.length > 0) {
        console.log(`Restored ${pendingDeletions.length} bug deletion timer(s).`);
    }

    // 2. Finish incomplete replays
    const incompleteReplays = await bugModel.getIncompleteReplays();
    for (const bug of incompleteReplays) {
        const guild = client.guilds.cache.get(bug.guildId);
        if (!guild) continue;
        const channel = bug.channelId ? guild.channels.cache.get(bug.channelId) : null;
        if (!channel) continue;
        try {
            await bugManager.replayUpdatesToChannel(channel, bug);
        } catch (err) {
            console.error(`Failed to finish replay for bug ${bug._id}:`, err);
        }
    }
    if (incompleteReplays.length > 0) {
        console.log(`Finished ${incompleteReplays.length} incomplete bug replay(s).`);
    }
}

module.exports = { initBugSystem };
