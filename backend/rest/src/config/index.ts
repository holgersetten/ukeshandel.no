import path from 'path';

interface Config {
  port: number;
  nodeEnv: string;
  
  // Paths
  offersDir: string;
  storeLogosDir: string;
  categoriesFile: string;
  dbPath: string;
  
  // External APIs
  tjekApiBaseUrl: string;
  publicApiUrl: string;
  
}

// Samme datastier ved kjøring fra TypeScript og fra dist.
const codeRoot = path.resolve(__dirname, '../../..');
const backendDir = path.basename(codeRoot) === 'dist' ? path.dirname(codeRoot) : codeRoot;
const resourcesDir = path.join(backendDir, 'persistence/src/resources');

const config: Config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Paths
  offersDir: process.env.OFFERS_DIR || path.join(resourcesDir, 'offers'),
  storeLogosDir: path.join(resourcesDir, 'img/store_logos'),
  categoriesFile: process.env.CATEGORIES_FILE || path.join(resourcesDir, 'categories.json'),
  dbPath: process.env.DB_PATH || path.resolve(backendDir, '../persistence/data/mattilbud.db'),
  
  // External APIs
  tjekApiBaseUrl: process.env.TJEK_API_BASE_URL || 'https://squid-api.tjek.com/v2',
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),
  
};

export default config;
