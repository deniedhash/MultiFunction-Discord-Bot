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

const todoSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    repoName: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['open', 'in_progress', 'done'], default: 'open' },
    priority: { type: String, default: 'medium' },
    assignee: { type: String, default: null },
    createdBy: { type: String, default: null },
    creatorPlatform: { type: String, default: 'discord' },
    creatorName: { type: String, required: true },
    dueDate: { type: Date, default: null },
    tags: { type: [String], default: [] },
    channelId: { type: String, default: null },
    embedMessageId: { type: String, default: null },
    todoListMessageId: { type: String, default: null },
    deletionScheduledAt: { type: Date, default: null },
    replayComplete: { type: Boolean, default: true },
    updates: [updateSchema],
    reopenedBy: [reopenEntrySchema],
}, { timestamps: true });

todoSchema.index({ guildId: 1 });
todoSchema.index({ guildId: 1, repoName: 1 });
todoSchema.index({ status: 1, deletionScheduledAt: 1 });

const Todo = mongoose.model('Todo', todoSchema);

async function createTodo(data) {
    return Todo.create(data);
}

async function getTodo(todoId) {
    return Todo.findById(todoId).lean();
}

async function getTodosByGuild(guildId) {
    return Todo.find({ guildId }).sort({ createdAt: -1 }).lean();
}

async function atomicSetStatus(todoId, fromStatus, toStatus, extra = {}) {
    return Todo.findOneAndUpdate(
        { _id: todoId, status: fromStatus },
        { $set: { status: toStatus, ...extra } },
        { new: true },
    ).lean();
}

async function atomicSetInProgress(todoId, userId) {
    return Todo.findOneAndUpdate(
        { _id: todoId, status: 'open', assignee: null },
        { $set: { status: 'in_progress', assignee: userId } },
        { new: true },
    ).lean();
}

async function addUpdate(todoId, update) {
    return Todo.findByIdAndUpdate(
        todoId,
        { $push: { updates: update } },
        { new: true },
    ).lean();
}

async function setDeletionScheduled(todoId, date) {
    return Todo.findByIdAndUpdate(todoId, { $set: { deletionScheduledAt: date } }).lean();
}

async function clearDeletionScheduled(todoId) {
    return Todo.findByIdAndUpdate(todoId, { $set: { deletionScheduledAt: null } }).lean();
}

async function addReopenEntry(todoId, entry) {
    return Todo.findByIdAndUpdate(
        todoId,
        { $push: { reopenedBy: entry }, $set: { status: 'open', assignee: null, deletionScheduledAt: null } },
        { new: true },
    ).lean();
}

async function setTodoChannelId(todoId, channelId) {
    return Todo.findByIdAndUpdate(todoId, { $set: { channelId } }).lean();
}

async function setTodoEmbedMessageId(todoId, embedMessageId) {
    return Todo.findByIdAndUpdate(todoId, { $set: { embedMessageId } }).lean();
}

async function setTodoListMessageId(todoId, todoListMessageId) {
    return Todo.findByIdAndUpdate(todoId, { $set: { todoListMessageId } }).lean();
}

async function setReplayComplete(todoId, value) {
    return Todo.findByIdAndUpdate(todoId, { $set: { replayComplete: value } }).lean();
}

async function getPendingDeletions() {
    return Todo.find({ status: 'done', deletionScheduledAt: { $ne: null } }).lean();
}

async function getIncompleteReplays() {
    return Todo.find({ replayComplete: false }).lean();
}

async function getTodosByGuildWithoutListMessage(guildId) {
    return Todo.find({ guildId, todoListMessageId: null }).sort({ createdAt: 1 }).lean();
}

async function deleteTodo(todoId) {
    return Todo.findByIdAndDelete(todoId).lean();
}

module.exports = {
    createTodo, getTodo, getTodosByGuild,
    atomicSetStatus, atomicSetInProgress,
    addUpdate, setDeletionScheduled, clearDeletionScheduled, addReopenEntry,
    setTodoChannelId, setTodoEmbedMessageId, setTodoListMessageId, setReplayComplete,
    getPendingDeletions, getIncompleteReplays, getTodosByGuildWithoutListMessage, deleteTodo,
};
