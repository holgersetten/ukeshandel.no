import axios from 'axios';
import type { OffersResponse, Category, CategorizeRequest, Classification, Assignment } from '../types/offer';
const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const api = axios.create({baseURL:`${apiOrigin}/api`});
const adminHeaders = () => {
  const key = sessionStorage.getItem('adminApiKey');
  return key ? {'x-admin-api-key': key} : undefined;
};
export const offersApi = {
  getClassificationMode: async () => (await api.get<{mode:string}>('/classification-mode')).data,
  authenticate: async (key:string) => (await axios.post(`${apiOrigin}/api/admin/auth`, {}, {headers:{'x-admin-api-key':key}})).data,
  getAllOffers: async () => (await api.get<OffersResponse>('/offers')).data,
  getOffersByStore: async (store: string) => (await api.get<OffersResponse>('/offers',{params:{store}})).data,
  getOffersNeedingReview: async () => (await api.get<OffersResponse>('/offers/review')).data,
  getHistoricalReview: async () => (await api.get<{classifications:Classification[]}>('/classifications/review')).data,
  getCategories: async () => (await api.get<{categories:Category[]}>('/categories')).data,
  categorizeOffer: async (data: CategorizeRequest) => (await api.post('/offers/categorize',data,{headers:adminHeaders()})).data,
  categorizeConcept: async (data:{conceptId?:string;offerOccurrenceId?:string;assignments:Assignment[]}) => (await api.post('/offers/categorize',data,{headers:adminHeaders()})).data,
  retryConcept: async (conceptId:string) => (await api.post('/classifications/retry',{conceptId},{headers:adminHeaders()})).data,
  getConcepts: async () => (await api.get<{concepts:{id:string;canonicalName:string;status:string}[];aliases:{id:string;normalizedTitle:string;scopeKey:string;conceptId:string;status:string}[]}>('/concepts',{headers:adminHeaders()})).data,
  linkOffer: async (data:{offerOccurrenceId:string;conceptId:string;approveGlobal:boolean}) => (await api.post('/concepts/link-offer',data,{headers:adminHeaders()})).data,
  revokeAlias: async (id:string) => (await api.delete('/concepts/aliases/'+id,{headers:adminHeaders()})).data,
  retryClassification: async (normalizedName: string) => (await api.post('/classifications/retry',{normalizedName},{headers:adminHeaders()})).data,
  retryAllClassifications: async () => (await api.post<{count:number;message:string}>('/classifications/retry-all',{}, {headers:adminHeaders()})).data,
  updateOffers: async ():Promise<{success:boolean;message:string}> => (await api.post('/offers/update',{}, {headers:adminHeaders()})).data,
  saveCategory: async (category: {id?:string;name:string;parentId:string|null;facet?:string;definition?:string;assignable?:boolean}) => category.id
    ? (await api.put<Category>('/categories/'+category.id,category,{headers:adminHeaders()})).data
    : (await api.post<Category>('/categories',category,{headers:adminHeaders()})).data,
  deleteCategory: async (id:string) => (await api.delete('/categories/'+id,{headers:adminHeaders()})).data
};
