const { SlashCommandBuilder } = require('discord.js')
const { verifyUser } = require('../../services/user.js')

const { getErrorEmbed, getSuccesEmbed } = require('../../discord/embeds/management.js')

const { commands } = require('../../config/league.js')
const ROLES_WITH_PERMS = commands.perms

module.exports = {
  data: new SlashCommandBuilder()
    .setName('usuario')
    .setDescription('Gestiona los usuarios')

    // /equipo crear
    .addSubcommand(sub =>
      sub
        .setName('verificar')
        .setDescription('Verifica a un usuario')
        .addUserOption(opt =>
          opt.setName('usuario').setDescription('Usuario ha verificar').setRequired(true))
        .addStringOption(opt =>
            opt.setName('brawl-id').setDescription('ID de Brawl Stars').setRequired(true))),

  async execute(interaction) {

    const member = interaction.member
    const hasPerms = member.roles.cache.some(role => ROLES_WITH_PERMS.includes(role.id))

    if (!hasPerms) {
        return interaction.reply({ embeds: [getErrorEmbed({ error: 'No tienes permisos para utilizar este comando.' })]})
    }

    const sub = interaction.options.getSubcommand()

    try {
      if (sub === 'verificar') {
        const user = interaction.options.getUser('usuario')
        const discordId = user.id
        const brawlId = interaction.options.getString('brawl-id')
        await verifyUser({ discordId, brawlId, client: interaction.client })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message: `Se ha verificado al usuario <@${discordId}> con el ID: \`${brawlId.startsWith('#') ? brawlId.toUpperCase() : `#${brawlId.toUpperCase()}`}\`.` })]
        })

      }

    } catch (error) {
      console.error(error)
      await interaction.reply(
        {
          embeds: [getErrorEmbed({ error: error.message })]
        }
      )
    }
  }
          }