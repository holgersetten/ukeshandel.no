import axios from 'axios';
import type { OffersResponse, Category, CategorizeRequest, Classification } from '../types/offer';
const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const api = axios.create({baseURL:`${apiOrigin}/api`});
const adminHeaders = () => {
  const key = sessionStorage.getItem('adminApiKey');
  return key ? {'x-admin-api-key': key} : undefined;
};
export const offersApi = {
  authenticate: async (key:string) => (await axios.post(`${apiOrigin}/api/admin/auth`, {}, {headers:{'x-admin-api-key':key}})).data,
  getAllOffers: async () => (await api.get<OffersResponse>('/offers')).data,
  getOffersByStore: async (store: string) => (await api.get<OffersResponse>('/offers',{params:{store}})).data,
  getOffersNeedingReview: async () => (await api.get<OffersResponse>('/offers/review')).data,
  getHistoricalReview: async () => (await api.get<{classifications:Classification[]}>('/classifications/review')).data,
  getCategories: async () => (await api.get<{categories:Category[]}>('/categories')).data,
  categorizeOffer: async (data: CategorizeRequest) => (await api.post('/offers/categorize',data,{headers:adminHeaders()})).data,
  retryClassification: async (normalizedName: string) => (await api.post('/classifications/retry',{normalizedName},{headers:adminHeaders()})).data,
  retryAllClassifications: async () => (await api.post<{count:number;message:string}>('/classifications/retry-all',{}, {headers:adminHeaders()})).data,
  updateOffers: async ():Promise<{success:boolean;message:string}> => (await api.post('/offers/update',{}, {headers:adminHeaders()})).data,
  saveCategory: async (category: {id?:string;name:string;parentId:string|null}) => category.id
    ? (await api.put<Category>('/categories/'+category.id,category,{headers:adminHeaders()})).data
    : (await api.post<Category>('/categories',category,{headers:adminHeaders()})).data,
  deleteCategory: async (id:string) => (await api.delete('/categories/'+id,{headers:adminHeaders()})).data
};
