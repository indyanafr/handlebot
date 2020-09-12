const path = require('path')
const Discord = require('discord.js')
const { DiscordPromptRunner } = require('discord.js-prompts')
const log = require('../utils/logger')
const fsPromises = require('fs').promises
const select = require('../interfaces/database/select')

class Command {

    /**
     * @param {string} name - Command name
     * @param {function} func - Command function
     * @param {boolean} owner - If this is an admin command
     */
    constructor(name, func, owner = false) {
        /**
         * @todo utiliser la variable admin pour verifier les permition de l'utilisateur
         */
        this.admin = owner
        this.name = name
        this.func = func
    }

    /**
     * Si un message doit passer le stockage de la commande
     * @param {import('discord.js').Message} message
     */
    static ignoreMessage (message) {
        const { author, client, guild, channel } = message
        if (!guild) {
            log.info('Message ignorer car ne vient pas d\'une guild')
            return true
        } else if (author.id === client.user.id) {
            log.info('Message Inorer car provien du bot lui même')
            return true
        } else if (DiscordPromptRunner.isActiveChannel(channel.id)) {
            log.info('Message car il y a une discution en prompt dans ce chanel')
            return true
        }
        return false
    }

    /**
     * Récupération de la commande depuis le message envoyer
     * @param {string} string
     * @param {boolean} withDefault
     * @returns {Promise<string>} - The command name
     */
    static parseForName (string, prefix) {
        if (!string.startsWith(prefix)) {
            return ''
        }
        //On Considére qu'il n'y a pas d'éspace entre le préfixe et la commande
        const target = string.split(' ')[0]
        const name = target.slice(prefix.length, target.length)
        return name
    }

    /**
     * Récupération d'une commande stoker dans le dossier commands grasse au message envoyer
     * @param {import('discord.js').Message} message
     * @returns Command
     */
    static async tryGetCommand(message) {
        const {guild} = message
        message.guild.lang = process.env.LANG
        let prefix = process.env.PREFIX
        let guildPrefix = await select.getGuildPrefix(guild.id)
        if (guildPrefix){
            prefix = guildPrefix
        }
        let name = this.parseForName(message.content, prefix)
        let command = this.get(name)
        log.warn(`Identification d'une commande ${name}`)
        if (command) {
            return command
        }
    }

    /**
     * Renvois la liste des nom des commandes
     * @param {boolean} admin - Si c'est une commande administrateur
     */
    static async readCommands (admin) {
        const folderPath = path.join(__dirname, '..', 'commands', admin ? 'admin' : '')
        const fileNames = await fsPromises.readdir(folderPath)
        return fileNames.filter(name => /\.js$/.test(name)).map(name => name.replace('.js', ''))
    }

    /**
     * Lecture et stockage de toutes les commandes
     * @returns {Promise<void>}
     */
    static async initialize () {
        if (this.initialized) {
            return
        }
        const commandNames = await this.readCommands()
        for (const name of commandNames) {
            const func = require(`../commands/${name}.js`)
            this.commands.set(name, new Command(name, func))
        }
        const adminCommandNames = await this.readCommands(true)
        for (const name of adminCommandNames) {
            const func = require(`../commands/admin/${name}.js`)
            this.commands.set(name, new Command(name, func, true))
        }
        this.initialized = true
    }

    /**
     * Get a command
     * @param {string} name
     * @returns {Command}
     */
    static get (name) {
        return Command.commands.get(name)
    }

    /**
     * Lancement de la commande
     * @param {import('discord.js').Message} message
     */
    async run (message) {
        const channelID = message.channel.id
        //permet d'evister les conflie sur le lancement des commande prompt
        DiscordPromptRunner.addActiveChannel(channelID)
        try {
            await this.func(message, this.name)
        } finally {
            DiscordPromptRunner.deleteActiveChannel(channelID)
        }
    }
}

/**
 * Si les commande on déjà était récupérer et insizialisée
 */
Command.initialized = false
Command.initialize()
/**
 * Inisialisaion des commandes
 * @type {Map<string, Command>}
 */
Command.commands = new Map()

module.exports = Command