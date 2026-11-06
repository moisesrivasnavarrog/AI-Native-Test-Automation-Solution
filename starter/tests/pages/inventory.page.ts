import type { Locator, Page } from '@playwright/test';

export class InventoryPage {
  readonly title: Locator;
  readonly items: Locator;

  constructor(private readonly page: Page) {
    this.title = page.locator('[data-test="title"]');
    this.items = page.locator('.inventory_item');
  }

  async openProduct(name: string) {
    await this.page
      .locator('[data-test="inventory-item-name"]')
      .filter({ hasText: name })
      .click();
  }
}
