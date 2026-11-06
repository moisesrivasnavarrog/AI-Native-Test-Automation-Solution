import type { Page } from '@playwright/test';
import type { UserCredentials } from '../data/users';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async login(user: UserCredentials) {
    await this.page.locator('[data-test="username"]').fill(user.username);
    await this.page.locator('[data-test="password"]').fill(user.password);
    await this.page.locator('[data-test="login-button"]').click();
  }
}
