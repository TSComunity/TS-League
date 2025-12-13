const { ActionRowBuilder } = require('discord.js')

const Team = require('../../../models/Team.js')
const { getUserBrawlData } = require('../../../utils/user.js')
const { getErrorEmbed, getSuccesEmbed } = require('../../../discord/embeds/management.js')
const { getTeamStatsEmbed } = require('../../../discord/embeds/team.js')
const { getTeamStatsMenu } = require('../../../discord/menus/team.js')
const emojis = require('../../../config/emojis.json')

module.exports = {
  condition: (id) => id.startsWith('teamStatsButton'),

  async execute(interaction) {
    try {
        const splittedId = interaction.customId.split('-')
        const teamName = splittedId[1]

        const team = await Team.findOne({ name: teamName })
            .populate('members.userId')
        if (!team) throw new Error('No se ha encontrado el equipo.')

        const data = await Promise.all(team.members.map(async m => {
          return await getUserBrawlData({ brawlId: m.userId.brawlId })
        }))

        const sortedMembers = team.members
          .map((member, index) => ({ member, stats: data[index] })) // unir member con su stats
          .sort((a, b) => (b.stats?.trophies || 0) - (a.stats?.trophies || 0)) // ordenar por trofeos descendente

        const row = new ActionRowBuilder().addComponents(
          getTeamStatsMenu({
            options: sortedMembers.map(({ member, stats }) => ({
              label: stats?.name || 'Jugador',
              description: `${stats?.trophies || 'No disponible'}`,
              value: member.userId.discordId.toString(),
              emoji: emojis.trophies
            }))
          })
        )

        interaction.reply({
            embeds: [getTeamStatsEmbed({ team })],
            components: [row],
            ephemeral: true
        })
    } catch (error) {
      console.error(error)
      return interaction.reply({
        ephemeral: true,
        embeds: [getErrorEmbed({ error: error.message })]
      })
    }
  }
}