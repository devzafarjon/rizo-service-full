// The bot lives in ./telegram/ (customer.ts, staff.ts, links.ts, text.ts, index.ts); this file keeps the old import path working.
export { handleUpdate, setTelegramCaller, startTelegramBot, telegramWebhook } from "./telegram/index.js";
