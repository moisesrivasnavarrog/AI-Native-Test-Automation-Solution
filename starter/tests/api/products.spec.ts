import { expect, test } from '@playwright/test';
import { dummyJsonProduct } from '../data/products';
import { ProductsApi, type Product } from './products.api';

test.describe('DummyJSON Products API', () => {
  test('returns the requested product by id', async ({ request }) => {
    const productsApi = new ProductsApi(request);

    const response = await productsApi.getProduct(dummyJsonProduct.id);
    expect(response.status()).toBe(200);

    const product = (await response.json()) as Product;
    expect(product.id).toBe(dummyJsonProduct.id);
    expect(product.title).toBeTruthy();
    expect(typeof product.price).toBe('number');
    expect(product.price).toBeGreaterThan(0);
  });
});
