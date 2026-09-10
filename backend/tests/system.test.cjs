const { test, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Testene bruker egne filer og egen database, og gjør ingen eksterne API-kall.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ukeshandel-test-'));
process.env.DB_PATH = path.join(temporary, 'test.db');
process.env.OFFERS_DIR = path.join(temporary, 'offers');
process.env.CATEGORIES_FILE = path.join(temporary, 'categories.json');
process.env.SKIP_AI = 'true';
fs.mkdirSync(process.env.OFFERS_DIR);
fs.copyFileSync(path.join(__dirname, '../persistence/src/resources/categories.json'), process.env.CATEGORIES_FILE);
const fixture = { title: 'Testprodukt', store: 'Meny', size: 500, unit: 'g', pieces: 1, price: 25, currency: 'NOK' };
const keys = require('../core/src/utils/productKey');
const legacyKey = keys.buildLegacyProductKey(fixture);
const productKey = keys.buildProductKey(fixture);
fs.writeFileSync(path.join(process.env.OFFERS_DIR, 'meny_offers.json'), JSON.stringify([{ ...fixture, productKey: legacyKey }]));
const database = require('../core/src/db/db');
database.initDb();
const cache = require('../core/src/db/categoryCacheRepo');
const categories = require('../core/src/config/categories');
const categoryService = require('../core/src/services/categoryService').default;
const categoryConfig = require('../core/src/services/categoryConfigService').default;
const offers = require('../core/src/services/offerService').default;
const updater = require('../core/src/services/offerUpdateService');
const metrics = require('../core/src/db/healthMetricsRepo');
const confidence = { main: 1, sub: 1, ingredientKey: 1 };
afterEach(() => mock.restoreAll());
after(() => {
  database.closeDb();
  // Slett kun den verifiserte midlertidige testmappen.
  assert.equal(path.dirname(temporary), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith('ukeshandel-test-'));
  fs.rmSync(temporary, { recursive: true });
});

test('samme produktnøkkel i alle tilbudsvisninger og ved innhenting', async () => {
  assert.equal((await offers.getAllOffers()).find(o => o.store === 'Meny').productKey, productKey);
  assert.equal((await offers.getOffersByStore('Meny'))[0].productKey, productKey);
  assert.equal((await offers.getOffersNeedingReview()).find(o => o.isActive).productKey, productKey);
  const tjek = require('../persistence/src/services/tjekApiService').default;
  mock.method(tjek, 'getStoreOffers', async () => [fixture]);
  const fetched = await offers.updateStoreOffers({ name: 'Meny', dealerId: 'test' });
  assert.equal(fetched[0].productKey, productKey);
  assert.equal(JSON.parse(fs.readFileSync(path.join(process.env.OFFERS_DIR, 'meny_offers.json')))[0].productKey, productKey);
});

test('manuell kategorisering overstyrer presis AI-cache og gjenbrukes for andre størrelser', () => {
  cache.upsert(productKey, { mainCategory: 'Middag', subCategory: 'Pasta', ingredientKey: 'pasta', source: 'ai', confidence });
  categoryService.setManualCategory(legacyKey, 'Middag', 'Ris', 'ris');
  assert.equal(categoryService.categorizeOffer(fixture).subCategory, 'Ris');
  assert.equal(categoryService.categorizeOffer({ ...fixture, size: 1000 }).subCategory, 'Ris');
  categoryService.setManualCategory(productKey, 'Middag', 'Pasta', 'pasta');
  assert.equal(categoryService.categorizeOffer(fixture).subCategory, 'Pasta');
  assert.equal(cache.getAll()[productKey].source, 'ai'); // Eldre oppføringer beholdes.
});

test('eldre kategoriseringer gjenbrukes uten prishistorikk', () => {
  const oldOffer = { ...fixture, title: 'Eldre produkt' };
  const oldKey = keys.buildLegacyProductKey(oldOffer);
  const { registerProductKeyAliases } = require('../core/src/db/productKeyAliases');
  registerProductKeyAliases(database.getDb(), [{ ...oldOffer, productKey: oldKey }]);
  cache.upsert(oldKey, { mainCategory: 'Middag', subCategory: 'Pasta', ingredientKey: 'pasta', source: 'manual', confidence });
  assert.equal(categoryService.categorizeOffer(oldOffer).subCategory, 'Pasta');
  assert.equal(database.getDb().prepare("SELECT name FROM sqlite_master WHERE name = 'price_history'").get(), undefined);
});

test('lagringsfeil rapporteres som mislykket butikkinnhenting', async () => {
  const tjek = require('../persistence/src/services/tjekApiService').default;
  const files = require('../persistence/src/services/fileService').default;
  mock.method(tjek, 'getStoreOffers', async () => [fixture]);
  mock.method(files, 'saveJSON', () => false);
  await assert.rejects(offers.updateStoreOffers({ name: 'Meny', dealerId: 'test' }), /Kunne ikke lagre/);
});

test('kategorier kan opprettes, omdøpes og slettes uten omstart eller endring av kildekode', () => {
  const sourcePath = path.join(__dirname, '../core/src/config/categories.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  categoryConfig.addMainCategory('Testkategori');
  categoryConfig.addSubCategory('Testkategori', 'Underkategori');
  categoryService.setManualCategory(productKey, 'Testkategori', 'Underkategori', 'test');
  categoryConfig.renameSubCategory('Testkategori', 'Underkategori', 'Nytt navn');
  categoryConfig.renameMainCategory('Testkategori', 'Ny kategori');
  assert.ok(categories.MAIN_CATEGORIES.includes('Ny kategori'));
  assert.equal(categoryService.categorizeOffer(fixture).subCategory, 'Nytt navn');
  assert.equal(categoryService.categorizeOffer(fixture).mainCategory, 'Ny kategori');
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), source);
  const reloaded = execFileSync(process.execPath, ['-r', 'ts-node/register', '-e',
    "process.stdout.write(JSON.stringify(require('./core/src/config/categories').CATEGORY_HIERARCHY))"],
    { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8', windowsHide: true });
  assert.deepEqual(JSON.parse(reloaded)['Ny kategori'], ['Nytt navn']);
  assert.throws(() => categoryConfig.removeMainCategory('Ukategorisert'));
  categoryConfig.removeMainCategory('Ny kategori');
  assert.equal(categoryService.categorizeOffer(fixture).mainCategory, 'Ukategorisert');
  assert.ok(!categories.MAIN_CATEGORIES.includes('Ny kategori'));
});

test('samtidige oppdateringer deler hele jobben og feil per butikk vises i resultatet', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const order = [];
  let reads = 0;
  mock.method(offers, 'getAllOffers', async () => ++reads === 1 ? [] : [{ ...fixture, productKey }, { ...fixture, productKey }]);
  const fetch = mock.method(offers, 'updateAllStoreOffersWithTracking', async () => { order.push('fetch'); await gate; return { errors: { Meny: 'testfeil' } }; });
  const categorize = mock.method(categoryService, 'categorizeOffers', async () => { order.push('categorize'); return []; });
  mock.method(categoryService, 'getPendingCount', () => 0);
  const first = updater.updateOffers();
  const second = updater.updateOffers();
  assert.equal(first, second);
  release();
  const result = await first;
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(categorize.mock.callCount(), 1);
  assert.deepEqual(order, ['fetch', 'categorize']);
  assert.equal(result.newProductKeys, 1);
  assert.equal(result.success, false);
  assert.equal(metrics.getLatestWeeklyUpdateMetrics().success, false);
  await updater.updateOffers();
  assert.equal(fetch.mock.callCount(), 2); // Låsen frigjøres etter ferdig jobb.
});

test('en feilet oppdatering frigjør låsen og registrerer feilen', async () => {
  const read = mock.method(offers, 'getAllOffers', async () => { throw new Error('testfeil'); });
  await assert.rejects(updater.updateOffers(), /testfeil/);
  await assert.rejects(updater.updateOffers(), /testfeil/);
  assert.equal(read.mock.callCount(), 2);
  assert.equal(metrics.getLatestWeeklyUpdateMetrics().errors.global, 'testfeil');
});
