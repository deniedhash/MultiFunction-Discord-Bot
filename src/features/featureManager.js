const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { itemDeleteDelay } = require("../../config");
const featureModel = require("./featureModel");

const deletionTimers = new Map();

// ── Channel helpers ──

function lockedCategoryOverwrites(guild) {
  return [
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
  ];
}

async function ensureFeaturesCategoryGeneral(guild) {
  const categoryName = "Features: General";
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
    permissionOverwrites: lockedCategoryOverwrites(guild),
  });
}

async function ensureFeaturesCategoryForRepo(guild, repoName) {
  const shortName = repoName.includes("/") ? repoName.split("/")[1] : repoName;
  const categoryName = `Features: ${shortName}`;
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
    permissionOverwrites: lockedCategoryOverwrites(guild),
  });
}

async function ensureAddFeatureChannel(guild, category) {
  const existing = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === "add-feature",
  );
  if (existing) return existing;
  return guild.channels.create({
    name: "add-feature",
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

async function ensureFeatureListChannel(guild, category) {
  const existing = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === "feature-list",
  );
  if (existing) return existing;
  return guild.channels.create({
    name: "feature-list",
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

async function createFeatureChannel(guild, category, feature) {
  let name = `feature-${feature.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)}`;
  const existing = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === name,
  );
  if (existing) {
    name = `${name}-${feature._id.toString().slice(-4)}`;
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

// ── Embed / component builders ──

function buildAddFeatureEmbed() {
  return new EmbedBuilder()
    .setTitle("Feature Tracker")
    .setDescription("Click the button below to propose a new feature.")
    .setColor(0x57f287);
}

function buildAddFeatureButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("feature_add")
      .setLabel("Propose Feature")
      .setEmoji("\u{1F680}")
      .setStyle(ButtonStyle.Primary),
  );
}

function buildRepoSelectMenu(repos) {
  const options = repos.map((r) => ({
    label: r.repoName,
    value: r.repoName,
    description: r.repoName,
  }));
  options.unshift({
    label: "General (Not tied to a repo)",
    value: "general",
    description: "A feature not associated with any specific repository.",
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("feature_select_repo")
    .setPlaceholder("Select a repository or General")
    .addOptions(options.slice(0, 25));
  return new ActionRowBuilder().addComponents(select);
}

function buildAddFeatureModal(repoName) {
  const modal = new ModalBuilder()
    .setCustomId(`feature_modal_add:${repoName}`)
    .setTitle("Propose a Feature");

  const titleInput = new TextInputBuilder()
    .setCustomId("feature_title")
    .setLabel("Feature Title")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId("feature_description")
    .setLabel("Description")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const priorityInput = new TextInputBuilder()
    .setCustomId("feature_priority")
    .setLabel("Priority (low / medium / high)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("medium");

  const dueDateInput = new TextInputBuilder()
    .setCustomId("feature_due_date")
    .setLabel("Due Date (YYYY-MM-DD)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Optional");

  const tagsInput = new TextInputBuilder()
    .setCustomId("feature_tags")
    .setLabel("Tags (comma-separated)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("e.g., frontend, backend, ui");

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(priorityInput),
    new ActionRowBuilder().addComponents(dueDateInput),
    new ActionRowBuilder().addComponents(tagsInput),
  );
  return modal;
}

function priorityColor(priority) {
  const colors = { low: 0x57f287, medium: 0xfee75c, high: 0xed4245 };
  return colors[priority] || 0xfee75c;
}

function formatCreator(feature) {
  return `<@${feature.createdBy}>`;
}

function buildFeatureDetailEmbed(feature) {
  const embed = new EmbedBuilder()
    .setTitle(`Feature: ${feature.title}`)
    .setDescription(feature.description || null)
    .setColor(priorityColor(feature.priority))
    .addFields(
      { name: "Status", value: feature.status.toUpperCase(), inline: true },
      { name: "Priority", value: feature.priority, inline: true },
      { name: "Created By", value: formatCreator(feature), inline: true },
    );
  if (feature.repositoryName)
    embed.addFields({
      name: "Repository",
      value: feature.repositoryName,
      inline: true,
    });
  if (feature.assignee)
    embed.addFields({
      name: "Assignee",
      value: `<@${feature.assignee}>`,
      inline: true,
    });
  if (feature.dueDate)
    embed.addFields({
      name: "Due Date",
      value: new Date(feature.dueDate).toDateString(),
      inline: true,
    });
  if (feature.tags && feature.tags.length > 0)
    embed.addFields({
      name: "Tags",
      value: feature.tags.join(", "),
      inline: true,
    });
  embed.setFooter({ text: `ID: ${feature._id}` });
  return embed;
}

function buildFeatureChannelButtons(feature) {
  const id = feature._id.toString();
  const isInProgress = feature.status === "in_progress";
  const isCompleted = feature.status === "completed";
  const isRejected = feature.status === "rejected";

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feature_wip_${id}`)
      .setLabel("In Progress")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isInProgress || isCompleted || isRejected),
    new ButtonBuilder()
      .setCustomId(`feature_update_${id}`)
      .setLabel("Update")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isCompleted || isRejected),
    new ButtonBuilder()
      .setCustomId(`feature_complete_${id}`)
      .setLabel("Complete")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isCompleted || isRejected),
    new ButtonBuilder()
      .setCustomId(`feature_reject_${id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isCompleted || isRejected),
  );
}

function statusEmoji(status) {
  if (status === "proposed") return "\u{1F7E1}"; // Yellow circle
  if (status === "in_progress") return "\u{1F535}"; // Blue circle
  if (status === "completed") return "\u2705"; // White heavy check mark
  if (status === "rejected") return "\u{1F534}"; // Red circle
  return "\u2753"; // Question mark
}

function buildFeatureListEmbed(feature) {
  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji(feature.status)} ${feature.title}`)
    .setColor(priorityColor(feature.priority))
    .addFields(
      { name: "Status", value: feature.status.toUpperCase(), inline: true },
      { name: "Priority", value: feature.priority, inline: true },
      { name: "Created By", value: formatCreator(feature), inline: true },
    )
    .setFooter({ text: `ID: ${feature._id}` });
  if (feature.repositoryName)
    embed.addFields({
      name: "Repository",
      value: feature.repositoryName,
      inline: true,
    });
  if (feature.channelId) {
    embed.addFields({
      name: "Channel",
      value: `<#${feature.channelId}>`,
      inline: true,
    });
  }
  return embed;
}

function buildFeatureListComponents(feature) {
  if (feature.status === "completed" || feature.status === "rejected") {
    const id = feature._id.toString();
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`feature_reopen_${id}`)
          .setLabel("Reopen")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  return [];
}

function buildUpdateModal(featureId) {
  const modal = new ModalBuilder()
    .setCustomId(`feature_modal_update_${featureId}`)
    .setTitle("Feature Update");

  const textInput = new TextInputBuilder()
    .setCustomId("feature_update_text")
    .setLabel("Update")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));
  return modal;
}

// ── Timer management ──

function scheduleDeletion(client, featureId, delayMs) {
  if (!delayMs) delayMs = itemDeleteDelay * 1000;
  cancelDeletion(featureId);
  console.log(`Scheduling deletion for feature ${featureId} in ${delayMs}ms`);
  const timer = setTimeout(async () => {
    deletionTimers.delete(featureId);
    try {
      const feature = await featureModel.getFeature(featureId);
      console.log(
        `Deletion timer fired for feature ${featureId}, status: ${feature?.status}, channelId: ${feature?.channelId}`,
      );
      if (
        !feature ||
        (feature.status !== "completed" && feature.status !== "rejected")
      )
        return;
      const guild = client.guilds.cache.get(feature.guildId);
      if (guild && feature.channelId) {
        const channel = guild.channels.cache.get(feature.channelId);
        if (channel) {
          await channel.delete("Feature completed/rejected — auto-cleanup");
          console.log(`Deleted channel for feature ${featureId}`);
        } else {
          console.log(
            `Channel ${feature.channelId} not found in cache for feature ${featureId}`,
          );
        }
      }
      await featureModel.setFeatureChannelId(featureId, null);
      await featureModel.setDeletionScheduled(featureId, null);
    } catch (err) {
      console.error(`Feature deletion error for ${featureId}:`, err);
    }
  }, delayMs);
  deletionTimers.set(featureId, timer);
}

function cancelDeletion(featureId) {
  const existing = deletionTimers.get(featureId);
  if (existing) {
    clearTimeout(existing);
    deletionTimers.delete(featureId);
  }
}

// ── Replay ──

async function replayUpdatesToChannel(channel, feature) {
  await featureModel.setReplayComplete(feature._id.toString(), false);

  // Post detail embed + buttons
  const embedMsg = await channel.send({
    embeds: [buildFeatureDetailEmbed(feature)],
    components: [buildFeatureChannelButtons(feature)],
  });
  await featureModel.setFeatureEmbedMessageId(
    feature._id.toString(),
    embedMsg.id,
  );

  if (feature.updates.length > 0 || feature.reopenedBy.length > 0) {
    const timeline = [];
    for (const u of feature.updates) {
      timeline.push({ type: "update", at: new Date(u.createdAt), data: u });
    }
    for (const r of feature.reopenedBy) {
      timeline.push({ type: "reopen", at: new Date(r.reopenedAt), data: r });
    }
    timeline.sort((a, b) => a.at - b.at);

    const lines = ["--- **History Replay** ---"];
    for (const entry of timeline) {
      if (entry.type === "update") {
        lines.push(
          `**Update** by <@${entry.data.userId}>:\n${entry.data.text}`,
        );
      } else {
        lines.push(`**Reopened** by <@${entry.data.userId}>`);
      }
    }
    lines.push("--- **End of Replay** ---");
    await channel.send(lines.join("\n\n"));
  }

  await featureModel.setReplayComplete(feature._id.toString(), true);
}

// ── Update feature-list message ──

async function updateFeatureListMessage(client, feature) {
  const guild = client.guilds.cache.get(feature.guildId);
  if (!guild) return;

  const category = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      c.name.toLowerCase() === "features",
  );
  if (!category) return;
  const featureListChannel = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name === "feature-list",
  );
  if (!featureListChannel) return;

  const embed = buildFeatureListEmbed(feature);
  const components = buildFeatureListComponents(feature);

  if (feature.featureListMessageId) {
    try {
      const msg = await featureListChannel.messages.fetch(
        feature.featureListMessageId,
      );
      await msg.edit({ embeds: [embed], components });
      return;
    } catch (err) {
      console.error(
        "Failed to edit feature-list message, sending new one:",
        err.message,
      );
    }
  }

  const msg = await featureListChannel.send({ embeds: [embed], components });
  await featureModel.setFeatureListMessageId(feature._id.toString(), msg.id);
}

async function backfillFeatureList(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  // Only backfill features for repos that are currently set up or general features
  const { getGuildRepoList } = require("../github/repoSetupModel");
  const activeRepos = await getGuildRepoList(guildId);
  const activeRepoNames = new Set(activeRepos.map((r) => r.repoName));

  const allFeatures = (await featureModel.getFeaturesByGuild(guildId)).filter(
    (feature) =>
      !feature.repositoryName || activeRepoNames.has(feature.repositoryName),
  );

  // 1. Create channels for unresolved features that don't have one
  for (const feature of allFeatures) {
    if (feature.status === "completed" || feature.status === "rejected")
      continue;
    const existingChannel = feature.channelId
      ? guild.channels.cache.get(feature.channelId)
      : null;
    if (existingChannel) continue;

    const featureId = feature._id.toString();
    const category = feature.repositoryName
      ? await ensureFeaturesCategoryForRepo(guild, feature.repositoryName)
      : await ensureFeaturesCategoryGeneral(guild);
    const channel = await createFeatureChannel(guild, category, feature);
    await featureModel.setFeatureChannelId(featureId, channel.id);

    const embedMsg = await channel.send({
      embeds: [buildFeatureDetailEmbed(feature)],
      components: [buildFeatureChannelButtons(feature)],
    });
    await featureModel.setFeatureEmbedMessageId(featureId, embedMsg.id);
  }

  // 2. Post all features to #feature-list (ordered by creation time, oldest first)
  const sortedFeatures = [...allFeatures].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );
  for (const feature of sortedFeatures) {
    // Clear stale featureListMessageId so updateFeatureListMessage posts a fresh one
    await featureModel.setFeatureListMessageId(feature._id.toString(), null);
    const freshFeature = await featureModel.getFeature(feature._id.toString());
    await updateFeatureListMessage(client, freshFeature);
  }
}

// ── External feature creation (API) ──

async function createFeatureFromExternal(client, data) {
  const {
    guildId,
    repositoryId,
    repositoryName,
    title,
    description,
    priority,
    createdBy,
    dueDate,
    tags,
  } = data;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const feature = await featureModel.createFeature({
    guildId,
    repositoryId: repositoryId || null,
    repositoryName: repositoryName || null,
    title,
    description: description || "No description provided.",
    priority: priority || "medium",
    createdBy: createdBy,
    dueDate: dueDate || null,
    tags: Array.isArray(tags) ? tags : [],
  });

  const featureId = feature._id.toString();

  // Only create channels if !addfeature has been set up (shared Features category exists)
  const featuresCategory = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      c.name.toLowerCase() === "features",
  );
  if (!featuresCategory) return feature;

  const category = feature.repositoryName
    ? await ensureFeaturesCategoryForRepo(guild, feature.repositoryName)
    : await ensureFeaturesCategoryGeneral(guild);
  const channel = await createFeatureChannel(guild, category, feature);
  await featureModel.setFeatureChannelId(featureId, channel.id);

  const embedMsg = await channel.send({
    embeds: [buildFeatureDetailEmbed(feature)],
    components: [buildFeatureChannelButtons(feature)],
  });
  await featureModel.setFeatureEmbedMessageId(featureId, embedMsg.id);

  const updatedFeature = await featureModel.getFeature(featureId);
  await updateFeatureListMessage(client, updatedFeature);

  return updatedFeature;
}

module.exports = {
  ensureFeaturesCategoryGeneral,
  ensureFeaturesCategoryForRepo,
  ensureAddFeatureChannel,
  ensureFeatureListChannel,
  createFeatureChannel,
  buildAddFeatureEmbed,
  buildAddFeatureButton,
  buildAddFeatureModal,
  buildRepoSelectMenu,
  buildFeatureDetailEmbed,
  buildFeatureChannelButtons,
  buildFeatureListEmbed,
  buildFeatureListComponents,
  buildUpdateModal,
  scheduleDeletion,
  cancelDeletion,
  replayUpdatesToChannel,
  updateFeatureListMessage,
  backfillFeatureList,
  createFeatureFromExternal,
  deletionTimers,
};
