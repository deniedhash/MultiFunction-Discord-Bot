const mongoose = require('mongoose');

const updateSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const reopenEntrySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    reopenedAt: { type: Date, default: Date.now },
}, { _id: false });

const bugSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    repoName: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    steps: { type: String, default: '' },
    severity: { type: String, default: 'normal' },
    status: { type: String, enum: ['open', 'wip', 'resolved'], default: 'open' },
    reportedBy: { type: String, default: null },
    reporterPlatform: { type: String, default: 'discord' },
    reporterName: { type: String, required: true },
    channelId: { type: String, default: null },
    embedMessageId: { type: String, default: null },
    bugListMessageId: { type: String, default: null },
    wipUserId: { type: String, default: null },
    wipUsername: { type: String, default: null },
    deletionScheduledAt: { type: Date, default: null },
    replayComplete: { type: Boolean, default: true },
    updates: [updateSchema],
    reopenedBy: [reopenEntrySchema],
}, { timestamps: true });

bugSchema.index({ guildId: 1 });
bugSchema.index({ guildId: 1, repoName: 1 });
bugSchema.index({ status: 1, deletionScheduledAt: 1 });

const Bug = mongoose.model('Bug', bugSchema);

async function createBug(data) {
    return Bug.create(data);
}

async function getBug(bugId) {
    return Bug.findById(bugId).lean();
}

async function getBugsByGuild(guildId) {
    return Bug.find({ guildId }).sort({ createdAt: -1 }).lean();
}

async function atomicSetStatus(bugId, fromStatus, toStatus, extra = {}) {
    return Bug.findOneAndUpdate(
        { _id: bugId, status: fromStatus },
        { $set: { status: toStatus, ...extra } },
        { new: true },
    ).lean();
}

async function atomicSetWip(bugId, userId, username) {
    return Bug.findOneAndUpdate(
        { _id: bugId, status: 'open', wipUserId: null },
        { $set: { status: 'wip', wipUserId: userId, wipUsername: username } },
        { new: true },
    ).lean();
}

async function addUpdate(bugId, update) {
    return Bug.findByIdAndUpdate(
        bugId,
        { $push: { updates: update } },
        { new: true },
    ).lean();
}

async function setDeletionScheduled(bugId, date) {
    return Bug.findByIdAndUpdate(bugId, { $set: { deletionScheduledAt: date } }).lean();
}

async function clearDeletionScheduled(bugId) {
    return Bug.findByIdAndUpdate(bugId, { $set: { deletionScheduledAt: null } }).lean();
}

async function addReopenEntry(bugId, entry) {
    return Bug.findByIdAndUpdate(
        bugId,
        { $push: { reopenedBy: entry }, $set: { status: 'open', wipUserId: null, wipUsername: null, deletionScheduledAt: null } },
        { new: true },
    ).lean();
}

async function setBugChannelId(bugId, channelId) {
    return Bug.findByIdAndUpdate(bugId, { $set: { channelId } }).lean();
}

async function setBugEmbedMessageId(bugId, embedMessageId) {
    return Bug.findByIdAndUpdate(bugId, { $set: { embedMessageId } }).lean();
}

async function setBugListMessageId(bugId, bugListMessageId) {
    return Bug.findByIdAndUpdate(bugId, { $set: { bugListMessageId } }).lean();
}

async function setReplayComplete(bugId, value) {
    return Bug.findByIdAndUpdate(bugId, { $set: { replayComplete: value } }).lean();
}

async function getPendingDeletions() {
    return Bug.find({ status: 'resolved', deletionScheduledAt: { $ne: null } }).lean();
}

async function getIncompleteReplays() {
    return Bug.find({ replayComplete: false }).lean();
}

async function getBugsByGuildWithoutListMessage(guildId) {
    return Bug.find({ guildId, bugListMessageId: null }).sort({ createdAt: 1 }).lean();
}

async function deleteBug(bugId) {
    return Bug.findByIdAndDelete(bugId).lean();
}

module.exports = {
    createBug, getBug, getBugsByGuild,
    atomicSetStatus, atomicSetWip,
    addUpdate, setDeletionScheduled, clearDeletionScheduled, addReopenEntry,
    setBugChannelId, setBugEmbedMessageId, setBugListMessageId, setReplayComplete,
    getPendingDeletions, getIncompleteReplays, getBugsByGuildWithoutListMessage, deleteBug,
};
