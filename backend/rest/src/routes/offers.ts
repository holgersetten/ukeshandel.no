import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import offerService from '../../../core/src/services/offerService';
import categoryService from '../../../core/src/services/categoryService';
import { updateOffers } from '../../../core/src/services/offerUpdateService';
import { getCategories, saveCategory, deleteCategory } from '../../../core/src/config/categories';
import * as cache from '../../../core/src/db/categoryCacheRepo';
import { getDb } from '../../../core/src/db/db';
import { conceptMode } from '../../../core/src/services/concepts/config';
import conceptService from '../../../core/src/services/concepts/conceptService';
import * as concepts from '../../../core/src/db/productConceptRepo';
import { saveTaxonomyCategory,retireTaxonomyCategory } from '../../../core/src/services/concepts/taxonomyService';
import type { Assignment } from '../../../core/src/services/concepts/types';
import { normalizeTitle } from '../../../core/src/utils/normalizeTitle';
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
router.post('/offers/categorize', requireAdminApiKey, async (req,res) => {
  try {
    if(conceptMode()==='concept') {
      if(!Array.isArray(req.body.assignments))throw new Error('assignments er påkrevd');
      let conceptId=req.body.conceptId;
      let original;
      if(typeof req.body.offerOccurrenceId==='string') {
        original=(await offerService.getAllOffers()).find(o=>o.offerOccurrenceId===req.body.offerOccurrenceId);
        if(!original)throw new Error('Tilbudsforekomsten finnes ikke');
        if(typeof conceptId==='string' && concepts.findConcept(original)!==conceptId)throw new Error('Tilbudsforekomsten tilhører et annet konsept');
      }
      if(typeof conceptId!=='string') {
        if(typeof req.body.offerOccurrenceId!=='string')throw new Error('conceptId eller offerOccurrenceId er påkrevd');
        if(!original)throw new Error('Tilbudsforekomsten finnes ikke');
        conceptId=concepts.ensureConcept(original);
      }
      conceptService.manual(conceptId,req.body.assignments as Assignment[],original?[original]:undefined);
      res.json({success:true,message:'Manuell konseptklassifisering lagret og låst'});return;
    }
    const {normalizedName,categoryIds} = req.body;
    if (typeof normalizedName !== 'string') throw new Error('normalizedName er påkrevd');
    categoryService.setManualCategory(normalizedName,categoryIds);
    res.json({success:true,message:'Kategorisering lagret'});
  } catch(error) { fail(res,error); }
});
router.post('/classifications/retry', requireAdminApiKey, async (req,res) => {
  try {
    if(conceptMode()==='concept') {
      if(typeof req.body.conceptId!=='string')throw new Error('conceptId er påkrevd');
      await conceptService.retry(req.body.conceptId);
      res.json({success:true,message:'Klassifisert på nytt fra original produktinformasjon'});return;
    }
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
  try { res.status(201).json(conceptMode()==='concept' ? saveTaxonomyCategory(undefined,{...req.body,parentId:req.body.parentId ?? null}) : saveCategory(undefined,req.body.name,req.body.parentId ?? null)); }
  catch(error) { fail(res,error); }
});
router.put('/categories/:id', requireAdminApiKey, (req:Request,res:Response) => {
  try { res.json(conceptMode()==='concept' ? saveTaxonomyCategory(String(req.params.id),{...req.body,parentId:req.body.parentId ?? null}) : saveCategory(String(req.params.id),req.body.name,req.body.parentId ?? null)); }
  catch(error) { fail(res,error); }
});
router.delete('/categories/:id', requireAdminApiKey, (req:Request,res:Response) => {
  try { if(conceptMode()==='concept')retireTaxonomyCategory(String(req.params.id));else deleteCategory(String(req.params.id)); res.json({success:true}); }
  catch(error) { fail(res,error); }
});
router.post('/offers/update', requireAdminApiKey, async (_req,res) => {
  try { res.json(await updateOffers()); } catch(error) { fail(res,error,500); }
});
// Includes historical names and migration conflicts even when there is no current offer.
router.get('/classifications/review', (_req,res) => {
  if(conceptMode()==='concept') {
    const names=new Map((concepts.getConcepts() as {id:string;canonicalName:string}[]).map(c=>[c.id,c.canonicalName]));
    res.json({classifications:concepts.allClassifications().filter(c=>c.needsReview||concepts.isStale(c)).map(c=>{
      const stale=concepts.isStale(c);
      return {...c,stale,needsReview:c.needsReview||stale,normalizedName:normalizeTitle(c.input[0]?.title || names.get(c.conceptId)||c.conceptId),categoryIds:c.assignments.map(a=>a.categoryId),reviewReason:c.reviewReasons.join(', ') || (stale?'stale_classification':null)};
    })});return;
  }
  res.json({classifications:cache.getAll().filter(c=>c.needsReview)});
});
router.get('/concepts',requireAdminApiKey,(_req,res)=>res.json({concepts:concepts.getConcepts(),aliases:concepts.getAliases()}));
router.post('/concepts/aliases',requireAdminApiKey,(req,res)=>{
  try {
    if(typeof req.body.title!=='string'||typeof req.body.conceptId!=='string')throw new Error('title og conceptId er påkrevd');
    if(req.body.offerOccurrenceId!==undefined&&typeof req.body.offerOccurrenceId!=='string')throw new Error('Ugyldig tilbudsforekomst');
    concepts.approveAlias(req.body.title,req.body.conceptId,req.body.offerOccurrenceId);
    res.json({success:true});
  }catch(error){fail(res,error);}
});
router.delete('/concepts/aliases/:id',requireAdminApiKey,(req,res)=>{
  try{concepts.revokeAlias(String(req.params.id));res.json({success:true});}catch(error){fail(res,error);}
});
router.post('/concepts/link-offer',requireAdminApiKey,async(req,res)=>{
  try{
    if(typeof req.body.offerOccurrenceId!=='string'||typeof req.body.conceptId!=='string'||
      (req.body.approveGlobal!==undefined&&typeof req.body.approveGlobal!=='boolean'))throw new Error('Ugyldig konseptkobling');
    const offer=(await offerService.getAllOffers()).find(o=>o.offerOccurrenceId===req.body.offerOccurrenceId);
    if(!offer)throw new Error('Tilbudsforekomsten finnes ikke');
    concepts.linkOccurrence(offer,req.body.conceptId,req.body.approveGlobal===true);
    res.json({success:true});
  }catch(error){fail(res,error);}
});
router.get('/classification-mode',(_req,res)=>res.json({mode:conceptMode(),taxonomyVersion:concepts.taxonomyVersion(),promptVersion:concepts.promptVersion()}));
router.get('/admin/migration', (_req,res) => {
  const row = getDb().prepare('SELECT report FROM schema_migrations WHERE name=?').get('normalized-categories-v1') as {report:string}|undefined;
  res.json(row ? JSON.parse(row.report) : null);
});
export default router;
