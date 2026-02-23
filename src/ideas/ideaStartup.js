const ideaModel = require('./ideaModel');
const ideaManager = require('./ideaManager');

async function initIdeaSystem(client) {
    const pendingDeletions = await ideaModel.getPendingDeletions();
    for (const idea of pendingDeletions) {
        const remaining = new Date(idea.deletionScheduledAt).getTime() - Date.now();
        if (remaining <= 0) {
            ideaManager.scheduleDeletion(client, idea._id.toString(), 1);
        } else {
            ideaManager.scheduleDeletion(client, idea._id.toString(), remaining);
        }
    }
    if (pendingDeletions.length > 0) {
        console.log(`Restored ${pendingDeletions.length} idea deletion timer(s).`);
    }
}

module.exports = { initIdeaSystem };
