import { test as base, expect, type Page } from '@playwright/test';
import { standardUser } from './data/users';
import { CartPage } from './pages/cart.page';
import { InventoryPage } from './pages/inventory.page';
import { LoginPage } from './pages/login.page';
import { ProductDetailsPage } from './pages/product-details.page';

type SauceDemoFixtures = {
  loginPage: LoginPage;
  /** Page already logged in as the standard user, on the inventory page. */
  authenticatedPage: Page;
  inventoryPage: InventoryPage;
  productDetailsPage: ProductDetailsPage;
  cartPage: CartPage;
};

export const test = base.extend<SauceDemoFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  authenticatedPage: async ({ page, loginPage }, use) => {
    await loginPage.goto();
    await loginPage.login(standardUser);
    await expect(page).toHaveURL(/inventory\.html/);
    await use(page);
  },

  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },

  productDetailsPage: async ({ page }, use) => {
    await use(new ProductDetailsPage(page));
  },

  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
});

export { expect };
