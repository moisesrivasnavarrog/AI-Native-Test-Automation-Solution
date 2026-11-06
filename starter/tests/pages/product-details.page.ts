import type { Locator, Page } from '@playwright/test';

export class ProductDetailsPage {
  readonly itemName: Locator;
  readonly cartBadge: Locator;

  constructor(private readonly page: Page) {
    this.itemName = page.locator('.inventory_details_name');
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
  }

  async addToCart() {
    await this.page.getByRole('button', { name: 'Add to cart' }).click();
  }

  async openCart() {
    await this.page.locator('[data-test="shopping-cart-link"]').click();
  }
}
