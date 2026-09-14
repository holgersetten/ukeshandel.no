import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import offerService from '../../../core/src/services/offerService';
import categoryService from '../../../core/src/services/categoryService';
import { updateOffers } from '../../../core/src/services/offerUpdateService';
import { getCategories, saveCategory, deleteCategory } from '../../../core/src/config/categories';
import * as cache from '../../../core/src/db/categoryCacheRepo';
import { getDb } from '../../../core/src/db/db';
const router = Router();
const fail = (res: Response, error: unknown, status = 400) => res.status(status).json({ error: (error as Error).message });
const requireAdminApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.ADMIN_API_KEY || '';
  const supplied = req.header('x-admin-api-key') || '';
  if (!expected) { res.status(503).json({error:'ADMIN_API_KEY er ikke konfigurert'}); return; }
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) { res.status(401).json({error:'Ugyldig admin-nøkkel'}); return; }
  return next();
};
router.post('/admin/auth', requireAdminApiKey, (_req,res) => res.json({success:true}));
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
router.post('/offers/categorize', requireAdminApiKey, (req,res) => {
  try {
    const {normalizedName,categoryIds} = req.body;
    if (typeof normalizedName !== 'string') throw new Error('normalizedName er påkrevd');
    categoryService.setManualCategory(normalizedName,categoryIds);
    res.json({success:true,message:'Kategorisering lagret'});
  } catch(error) { fail(res,error); }
});
router.post('/classifications/retry', requireAdminApiKey, (req,res) => {
  try {
    if (typeof req.body.normalizedName !== 'string') throw new Error('normalizedName er påkrevd');
    categoryService.retryCategory(req.body.normalizedName);
    res.json({success:true,message:'Kategoriseringen er frigitt for nytt AI-forsøk'});
  } catch(error) { fail(res,error); }
});
router.post('/classifications/retry-all', requireAdminApiKey, async (_req,res) => {
  try {
    const count = await categoryService.retryReviewCategories();
    res.json({success:true,count,message:`${count} kategoriseringer sendt til nytt AI-forsøk`});
  } catch(error) { fail(res,error,500); }
});
router.get('/categories', (_req,res) => res.json({categories:getCategories()}));
router.post('/categories', requireAdminApiKey, (req,res) => {
  try { res.status(201).json(saveCategory(undefined,req.body.name,req.body.parentId ?? null)); }
  catch(error) { fail(res,error); }
});
router.put('/categories/:id', requireAdminApiKey, (req:Request,res:Response) => {
  try { res.json(saveCategory(String(req.params.id),req.body.name,req.body.parentId ?? null)); }
  catch(error) { fail(res,error); }
});
router.delete('/categories/:id', requireAdminApiKey, (req:Request,res:Response) => {
  try { deleteCategory(String(req.params.id)); res.json({success:true}); }
  catch(error) { fail(res,error); }
});
router.post('/offers/update', requireAdminApiKey, async (_req,res) => {
  try { res.json(await updateOffers()); } catch(error) { fail(res,error,500); }
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
