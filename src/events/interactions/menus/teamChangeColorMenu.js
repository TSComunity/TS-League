const { ActionRowBuilder } = require('discord.js')

const { updateTeam, checkTeamUserHasPerms } = require('../../../services/team.js')

const { getErrorEmbed, getSuccesEmbed } = require('../../../discord/embeds/management.js')
const { getTeamInfoEmbed } = require('../../../discord/embeds/team.js')
const { sendLog } = require('../../../discord/send/staff.js')

const {
    getTeamLeftButton,
    getTeamChangeNameButton,
    getTeamChangeIconButton,
    getTeamChangeColorButton,
    getTeamManageMembersButton,
    getTeamReGenerateCodeButton
} = require('../../../discord/buttons/team.js')

const colors = require('../../../config/colors.json')

module.exports = {
  customId: 'teamChangeColorMenu',

  async execute(interaction, client) {
    const selectedColor = interaction.values[0]
    
    try {
      const discordId = interaction.user.id
      const team = await updateTeam({ discordId, color: selectedColor })

      const color = colors.find(c => c.value === selectedColor)

      await sendLog({
        content: `Cambió el color del equipo **${team.name}** a \`${color.emoji} ${color.label}\`.`,
        client: interaction.client,
        type: 'success',
        userId: discordId,
        eventType: 'team'
      })
      
      const perms = await checkTeamUserHasPerms({ discordId })

      let components = []

      if (perms) {
          components.push(new ActionRowBuilder().addComponents(
              getTeamChangeNameButton(),
              getTeamChangeIconButton(),
              getTeamChangeColorButton(),
              getTeamManageMembersButton(),
              getTeamReGenerateCodeButton()
          ))
      }

      components.push(new ActionRowBuilder().addComponents(
          getTeamLeftButton()
      ))

      await interaction.update({
        content: 'Equipo actualizado con exito.',
        embeds: [getTeamInfoEmbed({ perms, team })],
        components
      })

      await interaction.followUp({
        ephemeral: true,
        embeds: [getSuccesEmbed({ message: `Se ha actualizado el color del equipo **${team.name}** por \`${color.emoji} ${color.label}\`.` })]
      })
    } catch (err) {
      console.error(err)
      await interaction.reply({
        ephemeral: true,
        embeds: [getErrorEmbed({ error: err.message })]
      })
    }
  }
}