const config = require('../config/config');
const openaiService = require('./openaiService');
const ollamaService = require('./ollamaService');
const customService = require('./customService');
const openrouterService = require('./openrouterService');
const azureService = require('./azureService');

class AIServiceFactory {
  static getService() {
    switch (config.aiProvider) {
      case 'ollama':
        return ollamaService;
      case 'openai':
      default:
        return openaiService;
      case 'custom':
        return customService;
      case 'openrouter':
        return openrouterService;
      case 'azure':
        return azureService;
    }
  }
}

module.exports = AIServiceFactory;
