import axios from 'axios';
import type { OffersResponse, CategoryHierarchy, CategorizeRequest } from '../types/offer';

const API_BASE_URL = 'http://localhost:5000/api';

export const offersApi = {
  getAllOffers: async (): Promise<OffersResponse> => {
    const response = await axios.get<OffersResponse>(`${API_BASE_URL}/offers`);
    return response.data;
  },

  getOffersByStore: async (storeName: string): Promise<OffersResponse> => {
    const response = await axios.get<OffersResponse>(`${API_BASE_URL}/offers`, {
      params: { store: storeName }
    });
    return response.data;
  },

  getOffersNeedingReview: async (): Promise<OffersResponse> => {
    const response = await axios.get<OffersResponse>(`${API_BASE_URL}/offers/review`);
    return response.data;
  },

  getCategories: async (): Promise<{ categories: CategoryHierarchy }> => {
    const response = await axios.get<{ categories: CategoryHierarchy }>(`${API_BASE_URL}/categories`);
    return response.data;
  },

  categorizeOffer: async (data: CategorizeRequest): Promise<{ success: boolean; message: string }> => {
    const response = await axios.post(`${API_BASE_URL}/offers/categorize`, data);
    return response.data;
  },

  updateOffers: async (): Promise<{ message: string; timestamp: string }> => {
    const response = await axios.post(`${API_BASE_URL}/offers/update`);
    return response.data;
  },

  getHealthMetrics: async (): Promise<any> => {
    const response = await axios.get(`${API_BASE_URL}/admin/health`);
    return response.data;
  },

  // Category management
  addSubCategory: async (mainCategory: string, subCategory: string): Promise<{ success: boolean; message: string; note: string }> => {
    const response = await axios.post(`${API_BASE_URL}/categories/subcategory/add`, {
      mainCategory,
      subCategory
    });
    return response.data;
  },

  removeSubCategory: async (mainCategory: string, subCategory: string): Promise<{ success: boolean; message: string; note: string }> => {
    const response = await axios.post(`${API_BASE_URL}/categories/subcategory/remove`, {
      mainCategory,
      subCategory
    });
    return response.data;
  },

  renameSubCategory: async (mainCategory: string, oldName: string, newName: string): Promise<{ success: boolean; message: string; note: string }> => {
    const response = await axios.post(`${API_BASE_URL}/categories/subcategory/rename`, {
      mainCategory,
      oldName,
      newName
    });
    return response.data;
  },

  addMainCategory: async (mainCategory: string): Promise<{ success: boolean; message: string; note: string }> => {
    const response = await axios.post(`${API_BASE_URL}/categories/main/add`, {
      mainCategory
    });
    return response.data;
  },

  removeMainCategory: async (mainCategory: string): Promise<{ success: boolean; message: string; note: string }> => {
    const response = await axios.post(`${API_BASE_URL}/categories/main/remove`, {
      mainCategory
    });
    return response.data;
  },

  renameMainCategory: async (oldName: string, newName: string): Promise<{ success: boolean; message: string; note: string }> => {
    const response = await axios.post(`${API_BASE_URL}/categories/main/rename`, {
      oldName,
      newName
    });
    return response.data;
  }
};
