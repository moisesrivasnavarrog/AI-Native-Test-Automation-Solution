import type { Locator, Page } from '@playwright/test';

export class CartPage {
  readonly items: Locator;
  readonly itemName: Locator;

  constructor(private readonly page: Page) {
    this.items = page.locator('.cart_item');
    this.itemName = page.locator('[data-test="inventory-item-name"]');
  }
}
