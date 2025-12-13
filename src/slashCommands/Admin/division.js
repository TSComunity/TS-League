const { SlashCommandBuilder } = require('discord.js')
const { createDivision, deleteDivision, updateDivision } = require('../../services/division.js')
const { getErrorEmbed, getSuccesEmbed } = require('../../discord/embeds/management.js')
const { sendLog } = require('../../discord/send/staff.js')

const colors = require('../../config/colors.json')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('division')
    .setDescription('Gestiona las divisiones')
    .addSubcommand(sub =>
      sub
        .setName('crear')
        .setDescription('Crea una nueva división')
        .addStringOption(opt =>
          opt.setName('nombre')
            .setDescription('Nombre de la división')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('tier')
            .setDescription('Tier de la división')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('emoji')
            .setDescription('Emoji de la división')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('color')
            .setDescription('Color de la división')
            .setRequired(true)
            .addChoices(...colors.map(color => ({
                name: `${color.emoji} ${color.label}`, // Mostramos emoji + nombre
                value: color.value
            })))
        )
        .addChannelOption(opt =>
          opt.setName('categoria-equipos')
            .setDescription('Categoría de los canales de equipos')
            .setRequired(true)
            .addChannelTypes(4)
        )
        // Categoría de partidos
        .addChannelOption(opt =>
          opt.setName('categoria-partidos')
            .setDescription('Categoría de los canales de partidos')
            .setRequired(true)
            .addChannelTypes(4)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('eliminar')
        .setDescription('Elimina una división existente')
        .addStringOption(opt =>
          opt.setName('nombre')
            .setDescription('Nombre de la división a eliminar')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('actualizar')
        .setDescription('Actualiza una división')
        .addStringOption(opt =>
          opt.setName('nombre')
            .setDescription('Nombre actual de la división')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('nuevo-nombre')
            .setDescription('Nuevo nombre)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('nuevo-tier')
            .setDescription('Nuevo tier')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('nuevo-emoji')
            .setDescription('Nuevo emoji')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('nuevo-color')
            .setDescription('Nuevo color')
            .setRequired(false)
            .addChoices(...colors.map(color => ({
                name: `${color.emoji} ${color.label}`, // Mostramos emoji + nombre
                value: color.value
            })))
        )
          .addChannelOption(opt =>
            opt.setName('nueva-categoria-equipos')
              .setDescription('Categoría de los canales de equipos')
              .setRequired(false)
            .addChannelTypes(4)
        )
        // Categoría de partidos
        .addChannelOption(opt =>
          opt.setName('nueva-categoria-partidos')
            .setDescription('Categoría de los canales de partidos')
            .setRequired(false)
            .addChannelTypes(4)
        )
    ),

  async execute(interaction) {
    const subcomand = interaction.options.getSubcommand()

    try {
      if (subcomand === 'crear') {
        const name = interaction.options.getString('nombre')
        const tier = interaction.options.getInteger('tier')
        const emoji = interaction.options.getString('emoji')
        const color = interaction.options.getString('color')
        const teamsCategoryId = interaction.options.getChannel('categoria-equipos').id
        const matchesCategoryId = interaction.options.getChannel('categoria-partidos').id

        const division = await createDivision({
          name, tier, emoji, color,
          teamsCategoryId,
          matchesCategoryId
        })

        await interaction.reply({
          embeds: [getSuccesEmbed({ message: `División **${division.emoji} ${division.name}** creada.` })]
        })
        await sendLog({
          content: `División **${division.emoji} ${division.name}** creada.\nTier: ${division.tier}\nColor: ${division.color}\nEmoji: ${division.emoji}`,
          client: interaction.client,
          type: 'success',
          userId: interaction.user.id,
          eventType: 'division'
        })
      }

      else if (subcomand === 'eliminar') {
        const name = interaction.options.getString('nombre')
        const división = await deleteDivision({ name })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message: `División **${división.emoji} ${división.name}** eliminada.` })]
        })
        await sendLog({
          content: `División **${división.emoji} ${división.name}** eliminada.\nTier: ${división.tier}\nColor: ${división.color}\nEmoji: ${división.emoji}`,
          client: interaction.client,
          type: 'danger',
          userId: interaction.user.id,
          eventType: 'division'
        })
      }

      else if (subcomand === 'actualizar') {
        const name = interaction.options.getString('nombre')
        const newName = interaction.options.getString('nuevo-nombre')
        const newTier = interaction.options.getInteger('nuevo-tier')
        const newEmoji = interaction.options.getString('nuevo-emoji')
        const newColor = interaction.options.getString('nuevo-color')
        const newTeamsCategoryId = interaction.options.getChannel('nueva-categoria-equipos')?.id
        const newMatchesCategoryId = interaction.options.getChannel('nueva-categoria-partidos')?.id

        const división = await updateDivision({ name, newName, newTier, newEmoji, newColor, newTeamsCategoryId, newMatchesCategoryId })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message: `División **${división.emoji} ${división.name}** actualizada.` })]
        })
        await sendLog({
          content: `División **${división.emoji} ${división.name}** actualizada.\nNuevo nombre: ${newName || 'Sin cambio'}\nNuevo tier: ${newTier || 'Sin cambio'}\nNuevo color: ${newColor || 'Sin cambio'}\nNuevo emoji: ${newEmoji || 'Sin cambio'}`,
          client: interaction.client,
          type: 'warning',
          userId: interaction.user.id,
          eventType: 'division'
        })
      }
    } catch (error) {
      console.error(error)
      await interaction.reply({
          embeds: [getErrorEmbed({ error: error.message })]
      })
    }
  }
}