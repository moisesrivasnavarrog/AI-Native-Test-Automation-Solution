import { products } from './data/products';
import { expect, test } from './fixtures';

test.describe('SauceDemo', () => {
  test('standard user can log in and sees the products page', async ({
    authenticatedPage,
    inventoryPage,
  }) => {
    await expect(inventoryPage.title).toHaveText('Products');
    await expect(inventoryPage.items).toHaveCount(6);
  });

  test('standard user can add Sauce Labs Backpack to the cart', async ({
    authenticatedPage,
    inventoryPage,
    productDetailsPage,
    cartPage,
  }) => {
    // Select the product from the list to open its details page.
    await inventoryPage.openProduct(products.backpack);
    await expect(authenticatedPage).toHaveURL(/inventory-item\.html/);
    await expect(productDetailsPage.itemName).toHaveText(products.backpack);

    await productDetailsPage.addToCart();
    await expect(productDetailsPage.cartBadge).toHaveText('1');

    await productDetailsPage.openCart();
    await expect(authenticatedPage).toHaveURL(/cart\.html/);

    await expect(cartPage.items).toHaveCount(1);
    await expect(cartPage.itemName).toHaveText(products.backpack);
  });
});
