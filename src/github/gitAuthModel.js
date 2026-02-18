const mongoose = require('mongoose');
const crypto = require('crypto');
const { encryptionKey } = require('../../config');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
    if (!encryptionKey || encryptionKey.length < 1) {
        throw new Error('ENCRYPTION_KEY is not set in .env — required for storing GitHub tokens securely.');
    }
    // Hash the key to ensure it's exactly 32 bytes for AES-256
    return crypto.createHash('sha256').update(encryptionKey).digest();
}

function encrypt(text) {
    const key = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(data) {
    const key = getKey();
    const [ivHex, authTagHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const gitAuthSchema = new mongoose.Schema({
    serverId: { type: String, required: true, unique: true },
    users: { type: Map, of: new mongoose.Schema({ token: String }, { _id: false }), default: {} },
});

const GitAuth = mongoose.model('GitAuth', gitAuthSchema);

async function getGitAuths(serverId) {
    let doc = await GitAuth.findOne({ serverId });
    if (!doc) {
        doc = await GitAuth.create({ serverId, users: {} });
    }
    return doc;
}

async function saveGitAuths(serverId, userData) {
    await GitAuth.findOneAndUpdate(
        { serverId },
        { serverId, users: userData },
        { upsert: true },
    );
}

module.exports = { getGitAuths, saveGitAuths, encrypt, decrypt };
