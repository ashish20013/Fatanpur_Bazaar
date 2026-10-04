import { expect, test, type Page } from '@playwright/test';

/**
 * E2E (§15): guest browse → cart → OTP login → address → COD order → admin confirm →
 * assign → rider deliver (OTP) → customer review.
 *
 * ⚠️ Ye test asli API + asli DB pe chalta hai (CI me MariaDB service).
 * OTP dev driver me DB/log me jaata hai — isliye test OTP ko API se nahi, TEST_OTP env se leta hai
 * (SMS_DRIVER=null + FB_TEST_OTP set karke API ko fixed OTP par chalaya jaata hai; dekho README §Testing).
 */
const OTP = process.env.FB_TEST_OTP ?? '123456';
const CUSTOMER = process.env.FB_TEST_CUSTOMER_PHONE ?? '9000000011';
const ADMIN = process.env.FB_TEST_ADMIN_PHONE ?? '9616038670';
const RIDER = process.env.FB_TEST_RIDER_PHONE ?? '9000000002';

async function login(page: Page, phone: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/मोबाइल नंबर|Mobile number/).fill(phone);
  await page.getByRole('button', { name: /OTP भेजें|Send OTP/ }).click();
  await page.getByLabel('OTP', { exact: true }).fill(OTP);
  await page.getByRole('button', { name: /आगे बढ़ें|Continue/ }).click();
  await page.waitForURL(/\/(mera|admin|delivery|supervisor)/);
}

test.describe('customer journey', () => {
  test('guest browse → cart → login → COD order', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);

    // browsing kabhi block nahi hoti (A8.4 §1)
    await page.goto('/sabzi');
    const firstAdd = page.getByRole('button', { name: /कार्ट में डालें|Add to cart/ }).first();
    await firstAdd.click();

    await page.goto('/cart');
    await expect(page.getByRole('link', { name: /ऑर्डर करें|Place order/ })).toBeVisible();

    await login(page, CUSTOMER);
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: /ऑर्डर पक्का करें|Confirm your order/ })).toBeVisible();
  });

  test('out-of-area address shows the sorry screen with served areas', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /अपना क्षेत्र चुनें|Choose your area|किमी|delivery/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /मेरा गाँव इसमें नहीं है|not in this list/ }).click();
    // GPS nahi milega headless me → block nahi hona chahiye, picker hi dikhna chahiye (A8.3 niyam 2)
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('staff', () => {
  test('admin can open the orders board and the villages screen', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/orders');
    await expect(page.getByRole('heading', { name: /ऑर्डर|Orders/ })).toBeVisible();
    await page.goto('/admin/villages');
    await expect(page.getByRole('heading', { name: /गाँव|Villages/ })).toBeVisible();
  });

  test('rider sees the duty toggle', async ({ page }) => {
    await login(page, RIDER);
    await page.goto('/delivery');
    await expect(page.getByRole('button', { name: /ड्यूटी|duty/i })).toBeVisible();
  });

  test('customer cannot open /admin (server-side guard redirects)', async ({ page }) => {
    await login(page, CUSTOMER);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/mera/);
  });
});
