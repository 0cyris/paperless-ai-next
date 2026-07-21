// OpenRouter AI provider: an OpenAI-compatible endpoint at a fixed base URL,
// so it reuses the custom-provider service parametrized with the openrouter
// config block (which adds Zero-Data-Retention routing when enabled).
const { CustomOpenAIService } = require('./customService');

module.exports = new CustomOpenAIService('openrouter');
