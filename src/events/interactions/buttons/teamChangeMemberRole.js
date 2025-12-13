const { ActionRowBuilder } = require('discord.js')
const { checkTeamUserHasPerms } = require('../../../services/team.js')
const { getErrorEmbed, getSuccesEmbed } = require('../../../discord/embeds/management.js')
const { findTeam } = require('../../../utils/team.js')
const { getTeamChangeMemberRoleMenu } = require('../../../discord/menus/team.js')
const { getUserDisplayName } = require('../../../services/user.js')
const { getTeamCancelButton } = require('../../../discord/buttons/team.js')
const emojis = require('../../../config/emojis.json')

module.exports = {
  customId: 'teamChangeMemberRole',

  async execute(interaction) {
    const discordId = interaction.user.id;

    try {
      const perms = await checkTeamUserHasPerms({ discordId });
      if (!perms) {
        return interaction.reply({
          ephemeral: true,
          embeds: [getErrorEmbed({ error: 'No tienes permisos para cambiar roles.' })],
        });
      }

      const team = await findTeam({ discordId });
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
      const member = team.members.find(m => m.userId.discordId === discordId)
      let filteredMembers = [];

      if (member.role === 'leader') {
        filteredMembers = team.members.filter(m => m.userId.discordId !== discordId);
      } else if (member.role === 'sub-leader') {
        filteredMembers = team.members.filter(m => m.role === 'member');
      } else {
        // Si es miembro
        return interaction.reply({
          ephemeral: true,
          embeds: [getErrorEmbed({ error: 'No tienes permisos para cambiar roles.' })],
        });
      }

      if (filteredMembers.length === 0) {
        return interaction.reply({
          ephemeral: true,
          embeds: [getErrorEmbed({ error: 'No hay ningun miembro al que puedas cambiarle el rol.' })],
        });
      }

      const options = await Promise.all(
        filteredMembers.map(async m => ({
          label: await getUserDisplayName({ guild: interaction.guild, discordId: m.userId.discordId }),
          description: rolesJSON[m.role],
          value: m.userId.discordId,
          emoji: roleEmojis[m.role]
        }))
      )

      const row = new ActionRowBuilder().addComponents(getTeamChangeMemberRoleMenu({ options }));
      const row2 = new ActionRowBuilder().addComponents(getTeamCancelButton());

      await interaction.update({
        components: [row, row2]
      });

    } catch (error) {
      console.error(error);
      return interaction.reply({
        ephemeral: true,
        embeds: [getErrorEmbed({ error: error.message })],
      });
    }
  },
}