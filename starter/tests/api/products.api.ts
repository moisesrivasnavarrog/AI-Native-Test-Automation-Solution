import type { APIRequestContext, APIResponse } from '@playwright/test';

export const DUMMYJSON_API_BASE_URL = 'https://dummyjson.com';

export interface Product {
  id: number;
  title: string;
  price: number;
}

export class ProductsApi {
  constructor(private readonly request: APIRequestContext) {}

  async getProduct(productId: number): Promise<APIResponse> {
    return this.request.get(
      `${DUMMYJSON_API_BASE_URL}/products/${productId}`,
    );
  }
}
