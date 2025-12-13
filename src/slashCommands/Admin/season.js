const { SlashCommandBuilder } = require('discord.js');
const { startSeason, endSeason } = require('../../services/season.js');
const { getErrorEmbed, getSuccesEmbed } = require('../../discord/embeds/management.js');
const { sendLog } = require('../../discord/send/staff.js');
const Season = require('../../models/Season.js'); 
const fs = require('fs');
const path = require('path');
const { GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const emojis = require('../../config/emojis.json');
const config = require('../../config/league.js')
const Match = require('../../models/Match.js');
const ScheduledFunction = require('../../models/ScheduledFunction.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temporada')
    .setDescription('Gestiona la temporada')
    .addSubcommand(sub =>
      sub
        .setName('comenzar')
        .setDescription('Comienza una nueva temporada')
        .addStringOption(opt =>
          opt
            .setName('nombre')
            .setDescription('Nombre de la temporada')
            .setRequired(true)
        )
    )
    // Nuevos subcomandos:
    .addSubcommand(sub =>
      sub
        .setName('datos')
        .setDescription('Muestra los datos JSON de la temporada activa')
    )
    // .addSubcommand(sub =>
    //   sub
    //     .setName('crear-evento')
    //     .setDescription('Crea o sobreescribe el scheduled event de la temporada actual')
    // )
    .addSubcommand(sub =>
      sub
        .setName('agreglar-sets')
        .setDescription('Agrega sets aleatorios a la última ronda de cada división que no los tenga (uso de emergencia)')
    ),

  async execute(interaction, client) {
    const subcomand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    try {
      // ---------- EXISTENTES ----------
      if (subcomand === 'comenzar') {
        const name = interaction.options.getString('nombre');
        const season = await startSeason({ name, client });

        await interaction.reply({
          embeds: [getSuccesEmbed({ message: `Temporada **${season.name}** comenzada.` })],
        });

        await sendLog({
          content: `Temporada **${season.name}** comenzada.`,
          client: interaction.client,
          type: 'success',
          userId: interaction.user.id,
          eventType: 'season',
        });
      }

      // ---------- NUEVOS ----------
      else if (subcomand === 'datos') {
        const scheduledEvents = await ScheduledFunction.find({}).lean()
        await interaction.reply({
          content: '```json\n' + JSON.stringify(scheduledEvents, null, 2) + '\n```'
        });
      }

      // else if (subcomand === 'crear-evento') {
      //   const season = await Season.findOne({ status: 'active' }).populate('divisions.divisionId');
      //   if (!season) return interaction.reply({ embeds: [getErrorEmbed({ error: 'No hay temporada activa.' })] });
      //   if (!guild) return interaction.reply({ embeds: [getErrorEmbed({ error: 'No se encontró la guild.' })] });

      //   const guildObj = await client.guilds.fetch(guild.id);

      //   // Eliminar evento anterior si existe
      //   if (season.scheduledEventId) {
      //     const oldEvent = await guildObj.scheduledEvents.fetch(season.scheduledEventId).catch(() => null);
      //     if (oldEvent) await oldEvent.delete();
      //     season.scheduledEventId = null;
      //     await season.save();
      //   }

      //   const maxRounds = Math.max(0, ...season.divisions.map(d => d.rounds?.length || 0));
      //   const roundNumberPadded = String(maxRounds).padStart(2, '0');

      //   const imagePath = path.join(__dirname, '../../assets/tsLeagueBanner.webp');
      //   const imageBuffer = fs.readFileSync(imagePath);
      //   const imageBase64 = `data:image/webp;base64,${imageBuffer.toString('base64')}`;

      //   const eventName = `TS League — T${season.seasonIndex} · J${roundNumberPadded}`;
      //   const description = [
      //     `${emojis.season} Temporada ${season.name}`,
      //     `${emojis.round} Jornada: ${roundNumberPadded}`,
      //     `${emojis.match} Partidos: ${
      //       season.divisions.reduce((acc, d) => acc + d.rounds.reduce((a, r) => a + r.matches.length, 0), 0)
      //     }`
      //   ].join('\n');

      //   const ev = await guildObj.scheduledEvents.create({
      //     name: eventName,
      //     scheduledStartTime: new Date(Date.now() + 5 * 1000),
      //     privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      //     entityType: GuildScheduledEventEntityType.StageInstance,
      //     channel: config.channels.stage.id,
      //     description,
      //     image: imageBase64
      //   });

      //   if (ev?.id) {
      //     season.scheduledEventId = ev.id;
      //     await season.save();
      //   }

      //   await interaction.reply({ embeds: [getSuccesEmbed({ message: `Scheduled Event creado: **${eventName}**` })] });
      // }

      else if (subcomand === 'agreglar-sets') {
  const match = await Match.findOne({ matchIndex: 7 })
    .populate('teamAId teamBId sets.starPlayerId');

  if (!match) return interaction.reply({ embeds: [getErrorEmbed({ error: 'Partido no encontrado.' })] });

  match.sets[0].winner = match.teamBId._id
  match.sets[1].winner = match.teamBId._id
  match.scoreA = 0
  match.scoreB = 2
  await match.save();

  const match2 = await Match.findOne({ matchIndex: 8 })
    .populate('teamAId teamBId sets.starPlayerId');

  if (!match2) return interaction.reply({ embeds: [getErrorEmbed({ error: 'Partido no encontrado.' })] });

  match2.sets[0].winner = match2.teamBId._id
  match2.sets[1].winner = match2.teamBId._id
  match2.scoreA = 0
  match2.scoreB = 2
  await match2.save();

  const match3 = await Match.findOne({ matchIndex: 11 })
    .populate('teamAId teamBId sets.starPlayerId');

  if (!match3) return interaction.reply({ embeds: [getErrorEmbed({ error: 'Partido no encontrado.' })] });

  match3.sets[0].winner = match3.teamBId._id
  match3.sets[1].winner = match3.teamAId._id
  match3.sets[2].winner = match3.teamAId._id
  match3.scoreA = 1
  match3.scoreB = 2
  await match3.save();

  await interaction.reply({ embeds: [getSuccesEmbed({ message: `Sets actualizados correctamente para el partido 5.` })] });
}
    } catch (err) {
      console.error(err);
      await interaction.reply({ embeds: [getErrorEmbed({ error: err.message })], ephemeral: true });
    }
  }
};