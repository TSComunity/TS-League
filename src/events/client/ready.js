require('dotenv').config();
const { ActivityType } = require('discord.js');
const mongoose = require('mongoose');
const { MONGODB_URL } = require('../../config/config.js')
const wait = require('node:timers/promises').setTimeout;
var colors = require('colors');
const emojis = require('../../config/emojis.json');

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {

        await wait(3000);
        console.log(`[   BOT-READY     ]`.underline.red + " --- Empezando ".red + `  ${client.user.tag}`.red);

        mongoose.set('strictQuery', true);

        mongoose.connect(MONGODB_URL || '', {
            keepAlive: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        })
        .then(() => {
            console.log(`[   BOT-MONGO     ]`.underline.yellow + " --- Corriendo  ".yellow + ` Base de Datos en Funcionamiento`.yellow);
        })
        .catch(err => {
            console.error(`[   BOT-MONGO     ]`.underline.red + " --- Error conectando a la base de datos: ".red, err);
        });

        const activities = [
            `🚀 #TSLeague`,
            `📌 Gestionando Partidos`,
        ];

        setInterval(() => {
            const status = activities[Math.floor(Math.random() * activities.length)];
            client.user.setActivity({ type: ActivityType.Custom, state: `${status}`, name: 'estado' });
        }, 50000);
    },
};