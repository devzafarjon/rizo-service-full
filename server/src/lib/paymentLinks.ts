import { env } from "../config.js";

/**
 * Links to the Payme and Click payment pages for what a customer still owes on a request.
 * The links only open the provider's page; the payment is recorded by the office (a provider callback needs a
 * merchant contract and is not part of this build).
 * Until the merchant ids are set, both buttons still appear and open the provider's own site (`placeholder: true`),
 * so the screens look final; set PAYME_MERCHANT_ID / CLICK_SERVICE_ID + CLICK_MERCHANT_ID to make them real checkout links.
 */
export function paymentLinks(input: { displayId: string; balance: number; returnUrl: string }) {
  const amount = Math.round(input.balance);
  if (amount <= 0) return { enabled: false, amount: 0 };
  const links: { payme: string; click: string } = { payme: "https://payme.uz", click: "https://click.uz" };
  let placeholder = false;
  if (env.paymeMerchantId) {
    const params = `m=${env.paymeMerchantId};ac.order_id=${input.displayId};a=${amount * 100};c=${input.returnUrl}`;
    links.payme = `https://checkout.paycom.uz/${Buffer.from(params).toString("base64")}`;
  } else {
    placeholder = true;
  }
  if (env.clickServiceId && env.clickMerchantId) {
    const query = new URLSearchParams({
      service_id: env.clickServiceId,
      merchant_id: env.clickMerchantId,
      amount: String(amount),
      transaction_param: input.displayId,
      return_url: input.returnUrl,
    });
    links.click = `https://my.click.uz/services/pay?${query.toString()}`;
  } else {
    placeholder = true;
  }
  return { enabled: true, amount, placeholder, ...links };
}
