const Anthropic = require('@anthropic-ai/sdk')

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

module.exports = claude
