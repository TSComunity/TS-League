const { ActionRowBuilder } = require('discord.js')
const { checkTeamUserHasPerms } = require('../../../services/team.js')
const { findTeam } = require('../../../utils/team.js')

const { getErrorEmbed } = require('../../../discord/embeds/management.js')
const { getTeamKickMemberMenu } = require('../../../discord/menus/team.js')
const { getTeamCancelButton } = require('../../../discord/buttons/team.js')
const { getUserDisplayName } = require('../../../services/user.js')

const emojis = require('../../../config/emojis.json')

module.exports = {
  customId: 'teamKickMember',

  async execute(interaction) {
    try {
        const discordId = interaction.user.id
        const perms = await checkTeamUserHasPerms({ discordId })

        if (!perms) {
            return interaction.reply({
                ephemeral: true,
                embeds: [getErrorEmbed({ error: 'No tienes permisos para utilizar esta interaccion.' })]
            })
        }

      const team = await findTeam({ discordId })

      const member = team.members.find(m => m.userId.discordId === discordId)
      if (!member) throw new Error('No se encontro al usuario.')

      const role = member.role

      if (role === 'member') {
        return interaction.reply({
          ephemeral: true,
          embeds: [getErrorEmbed({ error: 'No tienes permisos para expulsar miembros.' })],
        })
      }

      const membersToKick = team.members.filter(m => {
        if (m.userId.discordId === discordId) return false; // no puede echarse a sí mismo
        if (role === 'leader') return true; // puede echar a cualquiera
        if (role === 'sub-leader') return m.role === 'member'; // solo puede echar a members
        return false
      });

      if (membersToKick.length === 0) {
        return interaction.reply({
          ephemeral: true,
          embeds: [getErrorEmbed({ error: 'No hay ningun miembro al que puedas expulsar.' })]
        })
      }
        const rolesJSON = {
          'leader': 'Líder',
          'sub-leader': 'Sub-líder',
          'member': 'Miembro'
        }
        const roleEmojis = {
          'leader': emojis.leader,
          'sub-leader': emojis.subLeader,
          'member': emojis.member
        }
        const options = await Promise.all(
        membersToKick.map(async m => ({
            label: await getUserDisplayName({ guild: interaction.guild, discordId: m.userId.discordId }),
            description: rolesJSON[m.role],
            value: m.userId.discordId,
            emoji: roleEmojis[m.role]
        }))
        )

      const row = new ActionRowBuilder().addComponents(getTeamKickMemberMenu({ options }))
      const row2 = new ActionRowBuilder().addComponents(getTeamCancelButton())

      await interaction.update({
        components: [row, row2],
      })

    } catch (error) {
      console.error(error);
      return interaction.reply({
        ephemeral: true,
        embeds: [getErrorEmbed({ error: error.message })],
      })
    }
  }
}