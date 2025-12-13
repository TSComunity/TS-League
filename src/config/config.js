require('dotenv').config()

module.exports = {
    TOKEN: process.env.TOKEN,
    PREFIX: process.env.PREFIX,
    MONGODB_URL: process.env.MONGODB_URL,
    BRAWL_STARS_API_KEY: process.env.BRAWL_STARS_API_KEY,
    IMGBB_API_KEY: process.env.IMGBB_API_KEY
}