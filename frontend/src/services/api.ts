import axios from 'axios';
import type { OffersResponse, Category, CategorizeRequest, Classification } from '../types/offer';
const api = axios.create({baseURL:'http://localhost:5000/api'});
export const offersApi = {
  getAllOffers: async () => (await api.get<OffersResponse>('/offers')).data,
  getOffersByStore: async (store: string) => (await api.get<OffersResponse>('/offers',{params:{store}})).data,
  getOffersNeedingReview: async () => (await api.get<OffersResponse>('/offers/review')).data,
  getHistoricalReview: async () => (await api.get<{classifications:Classification[]}>('/classifications/review')).data,
  getCategories: async () => (await api.get<{categories:Category[]}>('/categories')).data,
  categorizeOffer: async (data: CategorizeRequest) => (await api.post('/offers/categorize',data)).data,
  retryClassification: async (normalizedName: string) => (await api.post('/classifications/retry',{normalizedName})).data,
  retryAllClassifications: async () => (await api.post<{count:number;message:string}>('/classifications/retry-all')).data,
  updateOffers: async ():Promise<{success:boolean;message:string}> => (await api.post('/offers/update')).data,
  saveCategory: async (category: {id?:string;name:string;parentId:string|null}) => category.id
    ? (await api.put<Category>('/categories/'+category.id,category)).data
    : (await api.post<Category>('/categories',category)).data,
  deleteCategory: async (id:string) => (await api.delete('/categories/'+id)).data
};
