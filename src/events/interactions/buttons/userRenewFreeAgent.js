const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')

const User = require('../../../models/User.js')
const config = require('../../../config/league.js')
const { getUserBrawlData } = require('../../../utils/user.js')
const { getUserStatsEmbed } = require('../../../discord/embeds/user.js')
const { getErrorEmbed, getSuccesEmbed } = require('../../../discord/embeds/management.js')

const FREE_AGENT_DURATION_MS = 14 * 24 * 60 * 60 * 1000

module.exports = {
  condition: (id) => id === 'userRenewFreeAgent',

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true })

      const user = await User.findOne({ discordId: interaction.user.id })
      if (!user) {
        throw new Error('No se ha encontrado tu perfil de usuario.')
      }

      if (user.teamId) {
        throw new Error('No puedes renovar el estado de agente libre mientras formas parte de un equipo.')
      }

      if (user.isFreeAgent) {
        throw new Error('Ya tienes activo el estado de agente libre.')
      }

      const channel = await interaction.client.channels.fetch(
        config.channels.freeAgents.id
      )

      if (!channel || !channel.isTextBased()) {
        throw new Error('No se pudo acceder al canal de agentes libres.')
      }

      // Obtener datos de Brawl
      let data = null
      if (user.brawlId) {
        data = await getUserBrawlData({ brawlId: user.brawlId }).catch(() => null)
      }

      const embed = await getUserStatsEmbed({
        client: interaction.client,
        user,
        data,
        isFreeAgent: true
      })

      const contactButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Contactar')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/users/${user.discordId}`)
      )

      // Publicar inmediatamente en el canal
      const msg = await channel.send({
        embeds: [embed],
        components: [contactButton]
      })

      // Guardar estado renovado
      user.isFreeAgent = true
      user.freeAgentExpiresAt = new Date(Date.now() + FREE_AGENT_DURATION_MS)
      user.freeAgentMessageId = msg.id
      await user.save()

      await interaction.editReply({
        embeds: [
          getSuccesEmbed({
            title: 'Estado de agente libre renovado',
            description:
              `Tu estado de **agente libre** ha sido renovado correctamente y estará activo durante los próximos **14 días**.\n\n` +
              `Tu anuncio ya se encuentra publicado en <#${config.channels.freeAgents.id}>.`
          })
        ]
      })
    } catch (error) {
      console.error(error)
      return interaction.editReply({
        embeds: [getErrorEmbed({ error: error.message })]
      })
    }
  }
}