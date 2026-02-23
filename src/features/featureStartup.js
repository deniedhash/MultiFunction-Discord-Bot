const featureModel = require('./featureModel');
const featureManager = require('./featureManager');

async function initFeatureSystem(client) {
    // 1. Restore deletion timers for completed/rejected features with scheduled deletions
    const pendingDeletions = await featureModel.getPendingDeletions();
    for (const feature of pendingDeletions) {
        const remaining = new Date(feature.deletionScheduledAt).getTime() - Date.now();
        if (remaining <= 0) {
            // Already past due — delete immediately
            featureManager.scheduleDeletion(client, feature._id.toString(), 1);
        } else {
            featureManager.scheduleDeletion(client, feature._id.toString(), remaining);
        }
    }
    if (pendingDeletions.length > 0) {
        console.log(`Restored ${pendingDeletions.length} feature deletion timer(s).`);
    }

    // 2. Finish incomplete replays
    const incompleteReplays = await featureModel.getIncompleteReplays();
    for (const feature of incompleteReplays) {
        const guild = client.guilds.cache.get(feature.guildId);
        if (!guild) continue;
        const channel = feature.channelId ? guild.channels.cache.get(feature.channelId) : null;
        if (!channel) continue;
        try {
            await featureManager.replayUpdatesToChannel(channel, feature);
        } catch (err) {
            console.error(`Failed to finish replay for feature ${feature._id}:`, err);
        }
    }
    if (incompleteReplays.length > 0) {
        console.log(`Finished ${incompleteReplays.length} incomplete feature replay(s).`);
    }
}

module.exports = { initFeatureSystem };
