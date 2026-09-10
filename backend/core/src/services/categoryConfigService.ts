import categoryService from './categoryService';
import { CATEGORY_HIERARCHY, saveHierarchy, type CategoryHierarchy } from '../config/categories';

export type CategoryHierarchyData = CategoryHierarchy;

class CategoryConfigService {
  getCurrentHierarchy(): CategoryHierarchyData {
    return structuredClone(CATEGORY_HIERARCHY);
  }

  updateHierarchy(hierarchy: CategoryHierarchyData): boolean {
    saveHierarchy(hierarchy);
    return true;
  }

  addSubCategory(mainCategory: string, newSubCategory: string): boolean {
    const hierarchy = this.getCurrentHierarchy();
    
    if (!hierarchy[mainCategory]) {
      throw new Error(`Hovedkategori "${mainCategory}" finnes ikke`);
    }

    if (hierarchy[mainCategory].includes(newSubCategory)) {
      throw new Error(`Underkategori "${newSubCategory}" finnes allerede under "${mainCategory}"`);
    }

    // Legg til på slutten
    hierarchy[mainCategory].push(newSubCategory);

    return this.updateHierarchy(hierarchy);
  }

  /**
   * Legger til en ny hovedkategori
   */
  addMainCategory(newMainCategory: string): boolean {
    const hierarchy = this.getCurrentHierarchy();
    
    if (hierarchy[newMainCategory]) {
      throw new Error(`Hovedkategori "${newMainCategory}" finnes allerede`);
    }

    // Ny hovedkategori starter med tom array - brukeren må legge til underkategorier
    hierarchy[newMainCategory] = [];
    return this.updateHierarchy(hierarchy);
  }

  /**
   * Fjerner en hovedkategori
   */
  removeMainCategory(mainCategory: string): boolean {
    const hierarchy = this.getCurrentHierarchy();
    
    if (!hierarchy[mainCategory]) {
      throw new Error(`Hovedkategori "${mainCategory}" finnes ikke`);
    }

    delete hierarchy[mainCategory];
    const success = this.updateHierarchy(hierarchy);
    
    // Flytt alle produkter med denne kategorien til Ukategorisert
    if (success) {
      console.log(`🔄 Flytter produkter fra "${mainCategory}" til Ukategorisert`);
      categoryService.moveCategoryToUncategorized(mainCategory, null);
    }
    
    return success;
  }

  /**
   * Omdøper en hovedkategori
   */
  renameMainCategory(oldName: string, newName: string): boolean {
    const hierarchy = this.getCurrentHierarchy();
    
    if (!hierarchy[oldName]) {
      throw new Error(`Hovedkategori "${oldName}" finnes ikke`);
    }

    if (hierarchy[newName]) {
      throw new Error(`Hovedkategori "${newName}" finnes allerede`);
    }

    // Kopier underkategorier til nytt navn
    hierarchy[newName] = hierarchy[oldName];
    delete hierarchy[oldName];
    
    const success = this.updateHierarchy(hierarchy);
    
    // Oppdater alle cached produkter med den gamle kategorien
    if (success) {
      console.log(`🔄 Oppdaterer cache: ${oldName} → ${newName}`);
      categoryService.updateCachedMainCategory(oldName, newName);
    }
    
    return success;
  }

  /**
   * Fjerner en underkategori
   */
  removeSubCategory(mainCategory: string, subCategory: string): boolean {
    const hierarchy = this.getCurrentHierarchy();
    
    if (!hierarchy[mainCategory]) {
      throw new Error(`Hovedkategori "${mainCategory}" finnes ikke`);
    }

    const index = hierarchy[mainCategory].indexOf(subCategory);
    if (index === -1) {
      throw new Error(`Underkategori "${subCategory}" finnes ikke under "${mainCategory}"`);
    }

    hierarchy[mainCategory].splice(index, 1);
    const success = this.updateHierarchy(hierarchy);
    
    // Flytt alle produkter med denne underkategorien til Ukategorisert
    if (success) {
      console.log(`🔄 Flytter produkter fra "${mainCategory} > ${subCategory}" til Ukategorisert`);
      categoryService.moveCategoryToUncategorized(mainCategory, subCategory);
    }
    
    return success;
  }

  /**
   * Omdøper en underkategori
   */
  renameSubCategory(mainCategory: string, oldName: string, newName: string): boolean {
    const hierarchy = this.getCurrentHierarchy();
    
    if (!hierarchy[mainCategory]) {
      throw new Error(`Hovedkategori "${mainCategory}" finnes ikke`);
    }

    const index = hierarchy[mainCategory].indexOf(oldName);
    if (index === -1) {
      throw new Error(`Underkategori "${oldName}" finnes ikke under "${mainCategory}"`);
    }

    if (hierarchy[mainCategory].includes(newName)) {
      throw new Error(`Underkategori "${newName}" finnes allerede under "${mainCategory}"`);
    }

    hierarchy[mainCategory][index] = newName;
    const success = this.updateHierarchy(hierarchy);
    
    // Oppdater alle cached produkter med den gamle kategorien
    if (success) {
      console.log(`🔄 Oppdaterer cache: ${mainCategory} > ${oldName} → ${newName}`);
      categoryService.updateCachedSubCategory(mainCategory, oldName, newName);
    }
    
    return success;
  }
}

export default new CategoryConfigService();
