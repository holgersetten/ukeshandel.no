import { Router, Request, Response } from 'express';
import offerService from '../../../core/src/services/offerService';
import categoryService from '../../../core/src/services/categoryService';
import { updateOffers } from '../../../core/src/services/offerUpdateService';
import { getCategories, saveCategory, deleteCategory } from '../../../core/src/config/categories';
import * as metrics from '../../../core/src/db/healthMetricsRepo';
import * as cache from '../../../core/src/db/categoryCacheRepo';
import { getDb } from '../../../core/src/db/db';
const router = Router();
const fail = (res: Response, error: unknown, status = 400) => res.status(status).json({ error: (error as Error).message });
router.get('/offers', async (req, res) => {
  try {
    const offers = typeof req.query.store === 'string' ? await offerService.getOffersByStore(req.query.store) : await offerService.getAllOffers();
    res.json({ offers, count: offers.length });
  } catch(error) { fail(res,error,500); }
});
router.get('/offers/review', async (_req,res) => {
  try { const offers=await offerService.getOffersNeedingReview(); res.json({offers,count:offers.length}); }
  catch(error) { fail(res,error,500); }
});
router.post('/offers/categorize', (req,res) => {
  try {
    const {normalizedName,categoryIds} = req.body;
    if (typeof normalizedName !== 'string') throw new Error('normalizedName er påkrevd');
    categoryService.setManualCategory(normalizedName,categoryIds);
    res.json({success:true,message:'Kategorisering lagret'});
  } catch(error) { fail(res,error); }
});
router.post('/classifications/retry', (req,res) => {
  try {
    if (typeof req.body.normalizedName !== 'string') throw new Error('normalizedName er påkrevd');
    categoryService.retryCategory(req.body.normalizedName);
    res.json({success:true,message:'Kategoriseringen er frigitt for nytt AI-forsøk'});
  } catch(error) { fail(res,error); }
});
router.post('/classifications/retry-all', async (_req,res) => {
  try {
    const count = await categoryService.retryReviewCategories();
    res.json({success:true,count,message:`${count} kategoriseringer sendt til nytt AI-forsøk`});
  } catch(error) { fail(res,error,500); }
});
router.get('/categories', (_req,res) => res.json({categories:getCategories()}));
router.post('/categories', (req,res) => {
  try { res.status(201).json(saveCategory(undefined,req.body.name,req.body.parentId ?? null)); }
  catch(error) { fail(res,error); }
});
router.put('/categories/:id', (req:Request,res:Response) => {
  try { res.json(saveCategory(String(req.params.id),req.body.name,req.body.parentId ?? null)); }
  catch(error) { fail(res,error); }
});
router.delete('/categories/:id', (req:Request,res:Response) => {
  try { deleteCategory(String(req.params.id)); res.json({success:true}); }
  catch(error) { fail(res,error); }
});
router.post('/offers/update', async (_req,res) => {
  try { res.json(await updateOffers()); } catch(error) { fail(res,error,500); }
});
router.get('/admin/health', async (_req,res) => {
  try {
    const last = metrics.getLatestWeeklyUpdateMetrics();
    const offers = await offerService.getAllOffers();
    res.json({lastUpdate:last ? {...last,durationFormatted:`${(last.duration/60000).toFixed(1)} min`}:null,
      currentState:{totalOffers:offers.length,totalNormalizedNames:new Set(offers.map(o=>o.normalizedName)).size,
        offersPerStore:offerService.getOffersPerStore(offers),...categoryService.getCacheStatistics()},
      errors:last?.errors || {}});
  } catch(error) { fail(res,error,500); }
});
// Includes historical names and migration conflicts even when there is no current offer.
router.get('/classifications/review', (_req,res) => {
  res.json({classifications:cache.getAll().filter(c=>c.needsReview)});
});
router.get('/admin/migration', (_req,res) => {
  const row = getDb().prepare('SELECT report FROM schema_migrations WHERE name=?').get('normalized-categories-v1') as {report:string}|undefined;
  res.json(row ? JSON.parse(row.report) : null);
});
export default router;
