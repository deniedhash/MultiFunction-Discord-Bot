const mongoose = require('mongoose');

const ideaSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['open', 'under_review', 'accepted', 'rejected'], default: 'open' },
    categoryId: { type: String, default: null },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    ideaListMessageId: { type: String, default: null },
    createdBy: { type: String, required: true },
    tags: { type: [String], default: [] },
    deletionScheduledAt: { type: Date, default: null },
}, { timestamps: true });

ideaSchema.index({ guildId: 1 });
ideaSchema.index({ guildId: 1, status: 1 });
ideaSchema.index({ status: 1, deletionScheduledAt: 1 });

const Idea = mongoose.model('Idea', ideaSchema);

async function createIdea(data) {
    return Idea.create(data);
}

async function getIdea(ideaId) {
    return Idea.findById(ideaId).lean();
}

async function getIdeasByGuild(guildId) {
    return Idea.find({ guildId }).sort({ createdAt: -1 }).lean();
}

async function atomicSetStatus(ideaId, fromStatus, toStatus) {
    return Idea.findOneAndUpdate(
        { _id: ideaId, status: fromStatus },
        { $set: { status: toStatus } },
        { new: true },
    ).lean();
}

async function setIdeaChannelId(ideaId, channelId) {
    return Idea.findByIdAndUpdate(ideaId, { $set: { channelId } }).lean();
}

async function setIdeaMessageId(ideaId, messageId) {
    return Idea.findByIdAndUpdate(ideaId, { $set: { messageId } }).lean();
}

async function setIdeaListMessageId(ideaId, ideaListMessageId) {
    return Idea.findByIdAndUpdate(ideaId, { $set: { ideaListMessageId } }).lean();
}

async function setIdeaCategoryId(ideaId, categoryId) {
    return Idea.findByIdAndUpdate(ideaId, { $set: { categoryId } }).lean();
}

async function setDeletionScheduled(ideaId, date) {
    return Idea.findByIdAndUpdate(ideaId, { $set: { deletionScheduledAt: date } }).lean();
}

async function clearDeletionScheduled(ideaId) {
    return Idea.findByIdAndUpdate(ideaId, { $set: { deletionScheduledAt: null } }).lean();
}

async function getPendingDeletions() {
    return Idea.find({ status: 'rejected', deletionScheduledAt: { $ne: null } }).lean();
}

module.exports = {
    createIdea,
    getIdea,
    getIdeasByGuild,
    atomicSetStatus,
    setIdeaChannelId,
    setIdeaMessageId,
    setIdeaListMessageId,
    setIdeaCategoryId,
    setDeletionScheduled,
    clearDeletionScheduled,
    getPendingDeletions,
};
