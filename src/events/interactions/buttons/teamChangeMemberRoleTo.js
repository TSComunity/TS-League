const { ActionRowBuilder } = require('discord.js')

const { changeMemberRole, checkTeamUserHasPerms } = require('../../../services/team.js')

const { getErrorEmbed, getSuccesEmbed } = require('../../../discord/embeds/management.js')
const { getTeamInfoEmbed } = require('../../../discord/embeds/team.js')
const { sendLog } = require('../../../discord/send/staff.js')

const emojis = require('../../../config/emojis.json')

const {
    getTeamLeftButton,
    getTeamChangeNameButton,
    getTeamChangeIconButton,
    getTeamChangeColorButton,
    getTeamManageMembersButton,
    getTeamReGenerateCodeButton
} = require('../../../discord/buttons/team.js')

module.exports = {
  condition: (id) => id.startsWith('teamChangeMemberRoleTo'),

  async execute(interaction) {
    try {
      const splittedId = interaction.customId.split('_')
      const discordId = splittedId[2]
      const newRole = splittedId[1]

      let rol = ''
      if (newRole === 'leader') rol = `${emojis.leader} Líder`
      if (newRole === 'sub-leader') rol = `${emojis.subLeader} Sublíder`
      if (newRole === 'member') rol = `${emojis.member} Miembro`


      const perms = await checkTeamUserHasPerms({ discordId: interaction.user.id })

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
      

      const team = await changeMemberRole({ discordId, newRole, client: interaction.client })

      await sendLog({
        content: `Cambió el rol de <@${discordId}> a ${rol}.`,
        client: interaction.client,
        type: 'success',
        userId: interaction.user.id,
        eventType: 'promote'
      })

      await interaction.update({
        embeds: [getTeamInfoEmbed({ team })],
        components
      })

      await interaction.followUp({
        ephemeral: true,
        embeds: [getSuccesEmbed({ message: `Se ha actualizado el rol de <@${discordId}> ha ${rol}.`})]
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