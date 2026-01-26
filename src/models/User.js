const { model, Schema, Types } = require('mongoose')

let UserSchema = new Schema({
    discordId: { type: String, required: true },
    brawlId: { type: String },

    teamId: { type: Types.ObjectId, ref: 'Team' }, // Usar ./id de la division

    leagueStats: {
        leaguesWon: { type: Number, default: 0 },

        matchesWon: { type: Number, default: 0 },
        matchesLost: { type: Number, default: 0 },
        matchStarPlayer: { type: Number, default: 0 },

        setsWon: { type: Number, default: 0 },
        setsLost: { type: Number, default: 0 },
        setStarPlayer: { type: Number, default: 0 }
    },


    scrimStats: {
        matchesWon: { type: Number, default: 0 },
        matchesLost: { type: Number, default: 0 },
        matchStarPlayer: { type: Number, default: 0 },

        setsWon: { type: Number, default: 0 },
        setsLost: { type: Number, default: 0 },
        setStarPlayer: { type: Number, default: 0 }
    },

    isVerified: { type: Boolean, default: false },
    isFreeAgent: { type: Boolean, default: false },
    freeAgentMessageId: { type: String },
    freeAgentExpiresAt: { type: Date }
})

module.exports = model("User", UserSchema)