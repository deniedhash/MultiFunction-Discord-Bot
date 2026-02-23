const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { itemDeleteDelay } = require("../../config");
const ideaModel = require("./ideaModel");

const deletionTimers = new Map();

// ── Channel helpers ──

function discussionCategoryOverwrites(guild) {
  return [
    {
      id: guild.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [],
    },
    {
      id: guild.members.me.id,
      allow: [PermissionFlagsBits.SendMessages],
    },
  ];
}

async function ensureIdeasCategory(guild) {
  const categoryName = "Product Ideas";
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      c.name.toLowerCase() === categoryName.toLowerCase(),
  );
  if (existing) {
    if (existing.position !== 0) await existing.setPosition(0);
    return existing;
  }
  return guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
    position: 0,
    permissionOverwrites: discussionCategoryOverwrites(guild),
  });
}

async function ensureAddIdeaChannel(guild, category) {
  const existing = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === "add-idea",
  );
  if (existing) return existing;
  return guild.channels.create({
    name: "add-idea",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: guild.members.me.id,
        allow: [PermissionFlagsBits.SendMessages],
      },
    ],
  });
}

async function ensureIdeaListChannel(guild, category) {
  const existing = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === "idea-list",
  );
  if (existing) return existing;
  return guild.channels.create({
    name: "idea-list",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: guild.members.me.id,
        allow: [PermissionFlagsBits.SendMessages],
      },
    ],
  });
}

function sanitizeIdeaChannelName(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  let name = `idea-${slug || "untitled"}`;
  if (name.length > 100) name = name.slice(0, 100).replace(/-+$/g, "");
  return name;
}

function withUniqueSuffix(name, suffix) {
  const maxLen = 100;
  const extra = `-${suffix}`;
  if (name.length + extra.length <= maxLen) return `${name}${extra}`;
  const trimmed = name.slice(0, maxLen - extra.length).replace(/-+$/g, "");
  return `${trimmed}${extra}`;
}

async function createIdeaChannel(guild, category, idea) {
  let name = sanitizeIdeaChannelName(idea.title);
  const existing = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === name,
  );
  if (existing) {
    name = withUniqueSuffix(name, idea._id.toString().slice(-4));
  }
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: guild.members.me.id,
        allow: [PermissionFlagsBits.SendMessages],
      },
    ],
  });
}

// ── Embed / component builders ──

function buildAddIdeaEmbed() {
  return new EmbedBuilder()
    .setTitle("Idea Tracker")
    .setDescription("Click the button below to submit a new product idea.")
    .setColor(0x5865f2);
}

function buildAddIdeaButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("idea_add")
      .setLabel("Submit Idea")
      .setEmoji("\u{1F4A1}")
      .setStyle(ButtonStyle.Primary),
  );
}

function buildAddIdeaModal() {
  const modal = new ModalBuilder()
    .setCustomId("idea_modal_add")
    .setTitle("Submit an Idea");

  const titleInput = new TextInputBuilder()
    .setCustomId("idea_title")
    .setLabel("Idea Title")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId("idea_description")
    .setLabel("Description")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const tagsInput = new TextInputBuilder()
    .setCustomId("idea_tags")
    .setLabel("Tags (comma-separated)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("e.g., onboarding, ux, growth");

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(tagsInput),
  );
  return modal;
}

function statusColor(status) {
  const colors = {
    open: 0xfee75c,
    under_review: 0x5865f2,
    accepted: 0x57f287,
    rejected: 0xed4245,
  };
  return colors[status] || 0xfee75c;
}

function formatCreator(idea) {
  return `<@${idea.createdBy}>`;
}

function buildIdeaDetailEmbed(idea) {
  const embed = new EmbedBuilder()
    .setTitle(`Idea: ${idea.title}`)
    .setDescription(idea.description || null)
    .setColor(statusColor(idea.status))
    .addFields(
      { name: "Status", value: idea.status.toUpperCase(), inline: true },
      { name: "Created By", value: formatCreator(idea), inline: true },
    );
  if (idea.tags && idea.tags.length > 0)
    embed.addFields({
      name: "Tags",
      value: idea.tags.join(", "),
      inline: true,
    });
  embed.setFooter({ text: `ID: ${idea._id}` });
  return embed;
}

function buildIdeaChannelButtons(idea) {
  const id = idea._id.toString();
  const isOpen = idea.status === "open";
  const isFinal = idea.status === "accepted" || idea.status === "rejected";

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`idea_review_${id}`)
      .setLabel("Under Review")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isOpen),
    new ButtonBuilder()
      .setCustomId(`idea_accept_${id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isFinal),
    new ButtonBuilder()
      .setCustomId(`idea_reject_${id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isFinal),
  );

  if (isFinal) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`idea_reopen_${id}`)
        .setLabel("Open Again")
        .setStyle(ButtonStyle.Danger),
    );
  }

  return row;
}

function statusEmoji(status) {
  if (status === "open") return "\u{1F7E1}";
  if (status === "under_review") return "\u{1F535}";
  if (status === "accepted") return "\u2705";
  if (status === "rejected") return "\u{1F534}";
  return "\u2753";
}

function buildIdeaListEmbed(idea) {
  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji(idea.status)} ${idea.title}`)
    .setColor(statusColor(idea.status))
    .addFields(
      { name: "Status", value: idea.status.toUpperCase(), inline: true },
      { name: "Created By", value: formatCreator(idea), inline: true },
    )
    .setFooter({ text: `ID: ${idea._id}` });
  if (idea.channelId) {
    embed.addFields({
      name: "Channel",
      value: `<#${idea.channelId}>`,
      inline: true,
    });
  }
  if (idea.tags && idea.tags.length > 0) {
    embed.addFields({
      name: "Tags",
      value: idea.tags.join(", "),
      inline: true,
    });
  }
  return embed;
}

async function createIdeaFromInteraction(interaction, data) {
  const { guild, user } = interaction;
  const category = await ensureIdeasCategory(guild);

  const idea = await ideaModel.createIdea({
    guildId: guild.id,
    title: data.title,
    description: data.description || "",
    status: "open",
    categoryId: category.id,
    channelId: null,
    messageId: null,
    createdBy: user.id,
    tags: Array.isArray(data.tags) ? data.tags : [],
  });

  const ideaDoc = idea.toObject();
  const ideaId = ideaDoc._id.toString();
  const channel = await createIdeaChannel(guild, category, idea);
  await ideaModel.setIdeaChannelId(ideaId, channel.id);

  const embedMsg = await channel.send({
    embeds: [buildIdeaDetailEmbed(ideaDoc)],
    components: [buildIdeaChannelButtons(ideaDoc)],
  });
  await embedMsg.pin();
  await ideaModel.setIdeaMessageId(ideaId, embedMsg.id);

  await updateIdeaListMessage(interaction.client, {
    ...ideaDoc,
    channelId: channel.id,
    messageId: embedMsg.id,
  });

  return { ideaId, channel };
}

// ── Timer management ──

function scheduleDeletion(client, ideaId, delayMs) {
  if (!delayMs) delayMs = itemDeleteDelay * 1000;
  cancelDeletion(ideaId);
  console.log(`Scheduling deletion for idea ${ideaId} in ${delayMs}ms`);
  const timer = setTimeout(async () => {
    deletionTimers.delete(ideaId);
    try {
      const idea = await ideaModel.getIdea(ideaId);
      console.log(
        `Deletion timer fired for idea ${ideaId}, status: ${idea?.status}, channelId: ${idea?.channelId}`,
      );
      if (!idea || idea.status !== "rejected") return;
      const guild = client.guilds.cache.get(idea.guildId);
      if (guild && idea.channelId) {
        const channel = guild.channels.cache.get(idea.channelId);
        if (channel) {
          await channel.delete("Idea rejected — auto-cleanup");
          console.log(`Deleted channel for idea ${ideaId}`);
        } else {
          console.log(
            `Channel ${idea.channelId} not found in cache for idea ${ideaId}`,
          );
        }
      }
      await ideaModel.setIdeaChannelId(ideaId, null);
      await ideaModel.setIdeaMessageId(ideaId, null);
      await ideaModel.setDeletionScheduled(ideaId, null);
    } catch (err) {
      console.error(`Idea deletion error for ${ideaId}:`, err);
    }
  }, delayMs);
  deletionTimers.set(ideaId, timer);
}

function cancelDeletion(ideaId) {
  const existing = deletionTimers.get(ideaId);
  if (existing) {
    clearTimeout(existing);
    deletionTimers.delete(ideaId);
  }
}

// ── Update idea-list message ──

async function updateIdeaListMessage(client, idea) {
  const guild = client.guilds.cache.get(idea.guildId);
  if (!guild) return;

  const category = await ensureIdeasCategory(guild);
  if (!category) return;
  const ideaListChannel = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === "idea-list",
  );
  if (!ideaListChannel) return;

  const embed = buildIdeaListEmbed(idea);

  if (idea.ideaListMessageId) {
    try {
      const msg = await ideaListChannel.messages.fetch(idea.ideaListMessageId);
      await msg.edit({ embeds: [embed], components: [] });
      return;
    } catch (err) {
      console.error(
        "Failed to edit idea-list message, sending new one:",
        err.message,
      );
    }
  }

  const msg = await ideaListChannel.send({ embeds: [embed], components: [] });
  await ideaModel.setIdeaListMessageId(idea._id.toString(), msg.id);
}

async function backfillIdeaList(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const allIdeas = await ideaModel.getIdeasByGuild(guildId);

  // 1. Create channels for ideas that don't have one
  const category = await ensureIdeasCategory(guild);
  for (const idea of allIdeas) {
    const existingChannel = idea.channelId
      ? guild.channels.cache.get(idea.channelId)
      : null;
    if (existingChannel) continue;

    const ideaId = idea._id.toString();
    const channel = await createIdeaChannel(guild, category, idea);
    await ideaModel.setIdeaChannelId(ideaId, channel.id);

    const embedMsg = await channel.send({
      embeds: [buildIdeaDetailEmbed(idea)],
      components: [buildIdeaChannelButtons(idea)],
    });
    await embedMsg.pin();
    await ideaModel.setIdeaMessageId(ideaId, embedMsg.id);
  }

  // 2. Post all ideas to #idea-list (ordered by creation time, oldest first)
  const sortedIdeas = [...allIdeas].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );
  for (const idea of sortedIdeas) {
    await ideaModel.setIdeaListMessageId(idea._id.toString(), null);
    const freshIdea = await ideaModel.getIdea(idea._id.toString());
    await updateIdeaListMessage(client, freshIdea);
  }
}

module.exports = {
  ensureIdeasCategory,
  ensureAddIdeaChannel,
  ensureIdeaListChannel,
  createIdeaChannel,
  buildAddIdeaEmbed,
  buildAddIdeaButton,
  buildAddIdeaModal,
  buildIdeaDetailEmbed,
  buildIdeaChannelButtons,
  buildIdeaListEmbed,
  createIdeaFromInteraction,
  updateIdeaListMessage,
  backfillIdeaList,
  scheduleDeletion,
  cancelDeletion,
  deletionTimers,
};
