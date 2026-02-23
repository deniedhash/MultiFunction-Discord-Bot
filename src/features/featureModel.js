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

const featureSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    repositoryId: { type: String, default: null },
    repositoryName: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['proposed', 'in_progress', 'completed', 'rejected'], default: 'proposed' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assignee: { type: String, default: null },
    createdBy: { type: String, required: true },
    dueDate: { type: Date, default: null },
    tags: [{ type: String }],
    channelId: { type: String, default: null },
    embedMessageId: { type: String, default: null },
    featureListMessageId: { type: String, default: null },
    deletionScheduledAt: { type: Date, default: null },
    replayComplete: { type: Boolean, default: true },
    updates: [updateSchema],
    reopenedBy: [reopenEntrySchema],
}, { timestamps: true });

featureSchema.index({ guildId: 1 });
featureSchema.index({ guildId: 1, repositoryName: 1 });
featureSchema.index({ status: 1, deletionScheduledAt: 1 });

const Feature = mongoose.model('Feature', featureSchema);

async function createFeature(data) {
    return Feature.create(data);
}

async function getFeature(featureId) {
    return Feature.findById(featureId).lean();
}

async function getFeaturesByGuild(guildId) {
    return Feature.find({ guildId }).sort({ createdAt: -1 }).lean();
}

async function atomicSetStatus(featureId, fromStatus, toStatus, extra = {}) {
    return Feature.findOneAndUpdate(
        { _id: featureId, status: fromStatus },
        { $set: { status: toStatus, ...extra } },
        { new: true },
    ).lean();
}

async function atomicSetInProgress(featureId, userId) {
    return Feature.findOneAndUpdate(
        { _id: featureId, status: 'proposed', assignee: null },
        { $set: { status: 'in_progress', assignee: userId } },
        { new: true },
    ).lean();
}

async function addUpdate(featureId, update) {
    return Feature.findByIdAndUpdate(
        featureId,
        { $push: { updates: update } },
        { new: true },
    ).lean();
}

async function setDeletionScheduled(featureId, date) {
    return Feature.findByIdAndUpdate(featureId, { $set: { deletionScheduledAt: date } }).lean();
}

async function clearDeletionScheduled(featureId) {
    return Feature.findByIdAndUpdate(featureId, { $set: { deletionScheduledAt: null } }).lean();
}

async function addReopenEntry(featureId, entry) {
    return Feature.findByIdAndUpdate(
        featureId,
        { $push: { reopenedBy: entry }, $set: { status: 'proposed', assignee: null, deletionScheduledAt: null } },
        { new: true },
    ).lean();
}

async function setFeatureChannelId(featureId, channelId) {
    return Feature.findByIdAndUpdate(featureId, { $set: { channelId } }).lean();
}

async function setFeatureEmbedMessageId(featureId, embedMessageId) {
    return Feature.findByIdAndUpdate(featureId, { $set: { embedMessageId } }).lean();
}

async function setFeatureListMessageId(featureId, featureListMessageId) {
    return Feature.findByIdAndUpdate(featureId, { $set: { featureListMessageId } }).lean();
}

async function setReplayComplete(featureId, value) {
    return Feature.findByIdAndUpdate(featureId, { $set: { replayComplete: value } }).lean();
}

async function getPendingDeletions() {
    return Feature.find({ status: { $in: ['completed', 'rejected'] }, deletionScheduledAt: { $ne: null } }).lean();
}

async function getIncompleteReplays() {
    return Feature.find({ replayComplete: false }).lean();
}

async function getFeaturesByGuildWithoutListMessage(guildId) {
    return Feature.find({ guildId, featureListMessageId: null }).sort({ createdAt: 1 }).lean();
}

async function deleteFeature(featureId) {
    return Feature.findByIdAndDelete(featureId).lean();
}

module.exports = {
    createFeature, getFeature, getFeaturesByGuild,
    atomicSetStatus, atomicSetInProgress,
    addUpdate, setDeletionScheduled, clearDeletionScheduled, addReopenEntry,
    setFeatureChannelId, setFeatureEmbedMessageId, setFeatureListMessageId, setReplayComplete,
    getPendingDeletions, getIncompleteReplays, getFeaturesByGuildWithoutListMessage, deleteFeature,
};
