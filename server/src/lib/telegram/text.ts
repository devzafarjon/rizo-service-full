import { PUSH_TEXTS } from "../pushTexts.generated.js";
import { parseLocale, type AppLocale } from "../locale.js";

type Entry = Record<AppLocale, string>;

/** Everything the bot says, in the three languages of the system. `{{name}}` is replaced by `t()`. */
const TEXT = {
  // ---- first contact ------------------------------------------------------------------------------------------------
  chooseLanguage: { uz: "Tilni tanlang · Выберите язык · Choose your language", ru: "Tilni tanlang · Выберите язык · Choose your language", en: "Tilni tanlang · Выберите язык · Choose your language" },
  welcome: {
    uz: "RIZO Service botiga xush kelibsiz! Hisobingizni ulash uchun pastdagi tugma orqali raqamingizni yuboring yoki telefon raqamingizni yozing (SMS bilan kod yuboramiz).",
    ru: "Добро пожаловать в бот RIZO Service! Чтобы подключить аккаунт, отправьте номер кнопкой ниже или напишите свой номер телефона (мы пришлём код по SMS).",
    en: "Welcome to the RIZO Service bot! To connect your account, share your number with the button below or type your phone number (we will send a code by SMS).",
  },
  shareContact: { uz: "📱 Raqamimni yuborish", ru: "📱 Отправить мой номер", en: "📱 Share my number" },
  ownContactOnly: {
    uz: "Faqat o'zingizning raqamingizni yuboring: tugma orqali, yoki raqamni yozing va SMS kodni kiriting.",
    ru: "Отправьте только свой номер: кнопкой или напишите номер и введите код из SMS.",
    en: "Share only your own number: with the button, or type the number and enter the SMS code.",
  },
  noAccountTryTyping: {
    uz: "Telegram raqamingiz bilan hisob topilmadi. Hisobingizdagi (RIZO'da ro'yxatdan o'tgan) telefon raqamni yozing: unga SMS bilan kod yuboramiz.",
    ru: "Аккаунт с номером вашего Telegram не найден. Напишите номер телефона, указанный в RIZO: мы отправим на него код по SMS.",
    en: "No account matches your Telegram number. Type the phone number registered with RIZO and we will send a code to it by SMS.",
  },
  otpSms: { uz: "RIZO Service: Telegram uchun kod {{code}}. Uni hech kimga bermang.", ru: "RIZO Service: код для Telegram {{code}}. Никому его не сообщайте.", en: "RIZO Service: your Telegram code is {{code}}. Do not share it with anyone." },
  otpSent: {
    uz: "Raqamingizga (…{{tail}}) SMS orqali 6 xonali kod yubordik. Uni shu yerga yozing (5 daqiqa amal qiladi).",
    ru: "Мы отправили 6-значный код по SMS на ваш номер (…{{tail}}). Введите его здесь (действует 5 минут).",
    en: "We sent a 6-digit code by SMS to your number (…{{tail}}). Type it here (valid for 5 minutes).",
  },
  otpWrong: { uz: "Kod noto'g'ri. Yana {{left}} ta urinish qoldi.", ru: "Неверный код. Осталось попыток: {{left}}.", en: "That code is not right. {{left}} attempt(s) left." },
  otpTooMany: { uz: "Urinishlar tugadi. Raqamni qaytadan yozing yoki tugmadan foydalaning.", ru: "Попытки закончились. Напишите номер заново или используйте кнопку.", en: "No attempts left. Type the number again or use the button." },
  otpExpired: { uz: "Kod eskirgan. Raqamni qaytadan yozing.", ru: "Код устарел. Напишите номер заново.", en: "The code has expired. Type the number again." },
  otpLimit: { uz: "Bu raqamga kod juda ko'p yuborildi. Bir soatdan keyin urinib ko'ring yoki tugmadan foydalaning.", ru: "На этот номер отправлено слишком много кодов. Попробуйте через час или используйте кнопку.", en: "Too many codes were sent to this number. Try again in an hour or use the button." },
  noAccount: {
    uz: "Bu raqam bilan hisob topilmadi. Avval RIZO Service saytida ro'yxatdan o'ting yoki xizmat markaziga murojaat qiling.",
    ru: "Аккаунт с этим номером не найден. Сначала зарегистрируйтесь на сайте RIZO Service или обратитесь в сервисный центр.",
    en: "No account was found for this number. Register on the RIZO Service website first, or contact a service centre.",
  },
  linked: {
    uz: "Salom, {{name}}! Hisobingiz ulandi. Endi so'rovlaringiz haqidagi xabarlar shu yerga keladi.",
    ru: "Здравствуйте, {{name}}! Аккаунт подключён. Теперь сообщения о ваших заявках будут приходить сюда.",
    en: "Hello, {{name}}! Your account is connected. Updates about your requests will arrive here.",
  },
  linkExpired: {
    uz: "Bu havola eskirgan yoki ishlatilgan. Saytdan yoki ilovadan yangi havola oling.",
    ru: "Эта ссылка устарела или уже использована. Получите новую на сайте или в приложении.",
    en: "This link has expired or was already used. Get a new one on the website or in the app.",
  },
  staffLinked: {
    uz: "{{name}}, siz {{role}} sifatida ulandingiz. Ish xabarlari shu yerga keladi.",
    ru: "{{name}}, вы подключены как {{role}}. Рабочие уведомления будут приходить сюда.",
    en: "{{name}}, you are connected as {{role}}. Work alerts will arrive here.",
  },
  unlinked: { uz: "Telegram uzildi. Qayta ulash uchun /start yuboring.", ru: "Telegram отключён. Чтобы подключить снова, отправьте /start.", en: "Telegram is disconnected. Send /start to connect again." },
  notLinked: { uz: "Avval hisobingizni ulang: /start yuboring.", ru: "Сначала подключите аккаунт: отправьте /start.", en: "Please connect your account first: send /start." },

  // ---- menu ---------------------------------------------------------------------------------------------------------
  menuRequests: { uz: "📋 So'rovlarim", ru: "📋 Мои заявки", en: "📋 My requests" },
  menuNew: { uz: "➕ Yangi so'rov", ru: "➕ Новая заявка", en: "➕ New request" },
  menuWarranty: { uz: "🛡 Kafolat", ru: "🛡 Гарантия", en: "🛡 Warranty" },
  menuCenters: { uz: "📍 Servis markazlari", ru: "📍 Сервисные центры", en: "📍 Service centres" },
  menuMessage: { uz: "💬 Servisga yozish", ru: "💬 Написать сервису", en: "💬 Write to the service" },
  menuLanguage: { uz: "🌐 Til", ru: "🌐 Язык", en: "🌐 Language" },
  menuApp: { uz: "📲 Ilova va sayt", ru: "📲 Приложение и сайт", en: "📲 App and website" },
  menuPrompt: { uz: "Nima qilamiz?", ru: "Что сделаем?", en: "What would you like to do?" },
  languageChanged: { uz: "Til o'zgartirildi: O'zbekcha.", ru: "Язык изменён: Русский.", en: "Language changed: English." },
  back: { uz: "⬅️ Orqaga", ru: "⬅️ Назад", en: "⬅️ Back" },
  cancel: { uz: "✖️ Bekor qilish", ru: "✖️ Отмена", en: "✖️ Cancel" },
  cancelled: { uz: "Bekor qilindi.", ru: "Отменено.", en: "Cancelled." },

  // ---- requests -----------------------------------------------------------------------------------------------------
  requestsTitle: { uz: "So'rovlaringiz (bosib oching):", ru: "Ваши заявки (нажмите, чтобы открыть):", en: "Your requests (tap to open):" },
  noRequests: { uz: "Sizda hali so'rov yo'q. «➕ Yangi so'rov» orqali yarating.", ru: "У вас пока нет заявок. Создайте через «➕ Новая заявка».", en: "You have no requests yet. Create one with “➕ New request”." },
  noOpen: { uz: "Ochiq so'rovingiz yo'q.", ru: "У вас нет открытых заявок.", en: "You have no open requests." },
  noSuchRequest: { uz: "Bunday raqamli so'rov hisobingizda yo'q.", ru: "Заявки с таким номером нет в вашем аккаунте.", en: "No request with that number on your account." },
  cardStatus: { uz: "Holat", ru: "Статус", en: "Status" },
  cardTechnician: { uz: "Texnik", ru: "Техник", en: "Technician" },
  cardCreated: { uz: "Yaratildi", ru: "Создана", en: "Created" },
  cardVisit: { uz: "Tashrif", ru: "Визит", en: "Visit" },
  cardEstimate: { uz: "Smeta", ru: "Смета", en: "Estimate" },
  cardBalance: { uz: "To'lanmagan", ru: "К оплате", en: "Balance due" },
  partOrdered: { uz: "🔧 Ehtiyot qism buyurtma qilingan{{date}}", ru: "🔧 Запчасть заказана{{date}}", en: "🔧 The spare part is ordered{{date}}" },
  partWaiting: { uz: "🔧 Ehtiyot qism kutilmoqda", ru: "🔧 Ожидаем запчасть", en: "🔧 Waiting for a spare part" },
  partLate: { uz: "ketdi, kechikmoqda", ru: "задерживается", en: "is late" },
  expectedBy: { uz: " (kutilayotgan sana: {{date}})", ru: " (ожидаем к {{date}})", en: " (expected by {{date}})" },
  track: { uz: "🔗 Kuzatish sahifasi", ru: "🔗 Страница отслеживания", en: "🔗 Tracking page" },
  approve: { uz: "✅ Tasdiqlayman", ru: "✅ Согласен", en: "✅ Approve" },
  decline: { uz: "❌ Rad etaman", ru: "❌ Отклонить", en: "❌ Decline" },
  confirmVisit: { uz: "✅ Tashrifni tasdiqlayman", ru: "✅ Подтверждаю визит", en: "✅ Confirm the visit" },
  writeToService: { uz: "💬 Servisga yozish", ru: "💬 Написать сервису", en: "💬 Write to the service" },
  estimateApproved: { uz: "Smeta tasdiqlandi. Ixtiyoriy qatorlar kiritilmadi: ularni saytda tanlash mumkin.", ru: "Смета согласована. Необязательные пункты не включены: их можно выбрать на сайте.", en: "The estimate is approved. Optional lines were left out; you can choose them on the website." },
  estimateDeclined: { uz: "Smeta rad etildi.", ru: "Смета отклонена.", en: "The estimate was declined." },
  visitConfirmed: { uz: "Tashrif tasdiqlandi. Rahmat!", ru: "Визит подтверждён. Спасибо!", en: "The visit is confirmed. Thank you!" },
  thanksRating: { uz: "Bahoyingiz uchun rahmat!", ru: "Спасибо за оценку!", en: "Thank you for your rating!" },
  nothingToDo: { uz: "Bu amal endi mavjud emas.", ru: "Это действие больше недоступно.", en: "This action is no longer available." },

  // ---- writing to the service ---------------------------------------------------------------------------------------
  pickRequest: { uz: "Qaysi so'rov haqida yozasiz?", ru: "По какой заявке пишете?", en: "Which request is it about?" },
  writeNow: { uz: "{{id}} bo'yicha xabaringizni yozing (yoki /cancel):", ru: "Напишите сообщение по заявке {{id}} (или /cancel):", en: "Write your message about {{id}} (or /cancel):" },
  messageSent: { uz: "Xabaringiz servisga yuborildi.", ru: "Ваше сообщение отправлено в сервис.", en: "Your message was sent to the service." },
  photosInApp: {
    uz: "Rasmlar hozircha bot orqali qabul qilinmaydi: ularni ilova yoki sayt orqali yuboring.",
    ru: "Фото через бота пока не принимаются: отправьте их через приложение или сайт.",
    en: "Photos are not accepted through the bot yet: send them through the app or the website.",
  },

  // ---- new request --------------------------------------------------------------------------------------------------
  nrType: { uz: "Qanday so'rov?", ru: "Какая заявка?", en: "What kind of request?" },
  nrRepair: { uz: "🔧 Ta'mirlash", ru: "🔧 Ремонт", en: "🔧 Repair" },
  nrInstall: { uz: "🏠 O'rnatish", ru: "🏠 Установка", en: "🏠 Installation" },
  nrNoPurchases: {
    uz: "Hisobingizda xarid topilmadi. Xaridingiz bo'lsa, servis markaziga murojaat qiling yoki saytda so'rov yarating.",
    ru: "В вашем аккаунте нет покупок. Обратитесь в сервисный центр или создайте заявку на сайте.",
    en: "There is no purchase on your account. Contact a service centre or create the request on the website.",
  },
  nrProduct: { uz: "Qaysi mahsulot?", ru: "Какой товар?", en: "Which product?" },
  nrIssue: { uz: "Muammoni qisqacha yozing (nima bo'ldi?):", ru: "Коротко опишите проблему (что случилось?):", en: "Describe the problem briefly (what happened?):" },
  nrInstallNote: { uz: "O'rnatish uchun qo'shimcha izoh yozing (masalan, qaysi xonada):", ru: "Напишите комментарий к установке (например, в какой комнате):", en: "Add a note for the installation (for example, which room):" },
  nrWhere: { uz: "Qayerda xizmat ko'rsatilsin?", ru: "Где выполнить работу?", en: "Where should the work be done?" },
  nrInShop: { uz: "🏬 Servis markazida", ru: "🏬 В сервисном центре", en: "🏬 At a service centre" },
  nrOnSite: { uz: "🚗 Manzilimga kelsin", ru: "🚗 Выезд по адресу", en: "🚗 At my address" },
  nrAddress: {
    uz: "Manzilni yozing yoki joylashuvingizni yuboring (📎 → Joylashuv).",
    ru: "Напишите адрес или отправьте геолокацию (📎 → Геопозиция).",
    en: "Type the address or send your location (📎 → Location).",
  },
  nrUseMyAddress: { uz: "📍 Mening manzilim: {{address}}", ru: "📍 Мой адрес: {{address}}", en: "📍 My address: {{address}}" },
  nrSendLocation: { uz: "📍 Joylashuvni yuborish", ru: "📍 Отправить геопозицию", en: "📍 Send my location" },
  nrLocationLabel: { uz: "Telegram joylashuvi", ru: "Геопозиция из Telegram", en: "Telegram location" },
  nrCenter: { uz: "Qaysi servis markaziga olib borasiz?", ru: "В какой сервисный центр привезёте?", en: "Which service centre will you bring it to?" },
  nrSummary: {
    uz: "So'rovni tekshiring:\n{{type}} · {{product}}\nMuammo: {{issue}}\n{{where}}",
    ru: "Проверьте заявку:\n{{type}} · {{product}}\nПроблема: {{issue}}\n{{where}}",
    en: "Please check the request:\n{{type}} · {{product}}\nProblem: {{issue}}\n{{where}}",
  },
  nrWhereShop: { uz: "Servis markazi: {{name}}", ru: "Сервисный центр: {{name}}", en: "Service centre: {{name}}" },
  nrWhereSite: { uz: "Manzil: {{address}}", ru: "Адрес: {{address}}", en: "Address: {{address}}" },
  nrConfirm: { uz: "✅ Yuborish", ru: "✅ Отправить", en: "✅ Send" },
  nrCreated: { uz: "So'rov qabul qilindi: {{id}}. Holati haqida shu yerga yozamiz.", ru: "Заявка принята: {{id}}. О статусе напишем сюда.", en: "Request received: {{id}}. We will write the status updates here." },
  nrDuplicate: { uz: "Bu mahsulot bo'yicha ochiq so'rov allaqachon bor: {{id}}.", ru: "По этому товару уже есть открытая заявка: {{id}}.", en: "There is already an open request for this product: {{id}}." },
  nrFailed: { uz: "So'rovni yaratib bo'lmadi: {{reason}}", ru: "Не удалось создать заявку: {{reason}}", en: "The request could not be created: {{reason}}" },
  nrExpired: { uz: "Bu bosqich eskirgan. «➕ Yangi so'rov» ni qaytadan bosing.", ru: "Этот шаг устарел. Нажмите «➕ Новая заявка» ещё раз.", en: "This step has expired. Tap “➕ New request” again." },

  // ---- warranty, centres, app ---------------------------------------------------------------------------------------
  warrantyTitle: { uz: "Xaridlaringiz va kafolat:", ru: "Ваши покупки и гарантия:", en: "Your purchases and warranty:" },
  warrantyActive: { uz: "kafolatda, {{date}} gacha", ru: "на гарантии до {{date}}", en: "in warranty until {{date}}" },
  warrantyExpired: { uz: "kafolat tugagan ({{date}})", ru: "гарантия истекла ({{date}})", en: "warranty ended ({{date}})" },
  warrantyNone: { uz: "kafolatsiz", ru: "без гарантии", en: "no warranty" },
  noPurchases: { uz: "Hisobingizda xaridlar yo'q.", ru: "В вашем аккаунте нет покупок.", en: "There are no purchases on your account." },
  centersPick: { uz: "Qaysi hudud?", ru: "Какой регион?", en: "Which region?" },
  centersNone: { uz: "Servis markazlari ro'yxati bo'sh.", ru: "Список сервисных центров пуст.", en: "There are no service centres listed." },
  appText: {
    uz: "Barcha imkoniyatlar RIZO Mijoz ilovasi va saytda: so'rovlar, smeta, to'lov, rasmlar, tashrif vaqtini tanlash.",
    ru: "Все возможности — в приложении RIZO Mijoz и на сайте: заявки, смета, оплата, фото, выбор времени визита.",
    en: "Everything is in the RIZO Mijoz app and on the website: requests, estimates, payment, photos, choosing a visit time.",
  },
  openSite: { uz: "🌐 Shaxsiy kabinet", ru: "🌐 Личный кабинет", en: "🌐 My account" },
  getApp: { uz: "📲 Ilovani yuklab olish", ru: "📲 Скачать приложение", en: "📲 Get the app" },
  help: {
    uz: "Buyruqlar: /menu — menyu, /status — so'rovlar, /message — servisga yozish, /lang — til, /stop — Telegramni uzish.",
    ru: "Команды: /menu — меню, /status — заявки, /message — написать сервису, /lang — язык, /stop — отключить Telegram.",
    en: "Commands: /menu — menu, /status — requests, /message — write to the service, /lang — language, /stop — disconnect Telegram.",
  },

  // ---- staff --------------------------------------------------------------------------------------------------------
  staffAlerts: { uz: "🔔 Xabarlar", ru: "🔔 Уведомления", en: "🔔 Alerts" },
  staffJobs: { uz: "🧰 Ishlarim", ru: "🧰 Мои работы", en: "🧰 My jobs" },
  staffOverview: { uz: "📊 Holat", ru: "📊 Обзор", en: "📊 Overview" },
  staffPause: { uz: "🔕 Xabarlarni o'chirish", ru: "🔕 Выключить уведомления", en: "🔕 Mute alerts" },
  staffResume: { uz: "🔔 Xabarlarni yoqish", ru: "🔔 Включить уведомления", en: "🔔 Unmute alerts" },
  staffUnlink: { uz: "🔌 Telegramni uzish", ru: "🔌 Отключить Telegram", en: "🔌 Disconnect Telegram" },
  staffNoAlerts: { uz: "Yangi xabar yo'q.", ru: "Новых уведомлений нет.", en: "No new alerts." },
  staffNoJobs: { uz: "Ochiq ish yo'q.", ru: "Открытых работ нет.", en: "No open jobs." },
  staffJobsTitle: { uz: "Ochiq ishlaringiz:", ru: "Ваши открытые работы:", en: "Your open jobs:" },
  staffMuted: { uz: "Xabarlar o'chirildi. Qayta yoqish uchun menyudan foydalaning.", ru: "Уведомления выключены. Включить можно в меню.", en: "Alerts are muted. Use the menu to turn them on again." },
  staffUnmuted: { uz: "Xabarlar yoqildi.", ru: "Уведомления включены.", en: "Alerts are on again." },
  staffOverviewText: {
    uz: "Yangi: {{new}} · Ochiq: {{open}} · Muddati o'tgan: {{overdue}} · Qism kutayotgan: {{parts}}",
    ru: "Новых: {{new}} · Открытых: {{open}} · Просрочено: {{overdue}} · Ждут запчасть: {{parts}}",
    en: "New: {{new}} · Open: {{open}} · Overdue: {{overdue}} · Waiting for parts: {{parts}}",
  },
  openInApp: { uz: "Ochish", ru: "Открыть", en: "Open" },
  rate: { uz: "Xizmatni baholang:", ru: "Оцените сервис:", en: "Rate the service:" },
} as const satisfies Record<string, Entry>;

export type TextKey = keyof typeof TEXT;

export function t(key: TextKey, locale?: string | null, params: Record<string, string | number> = {}) {
  const entry: Entry = TEXT[key];
  const text = entry[parseLocale(locale)];
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(params[name] ?? ""));
}

/** Every language's wording of one key (to recognise a menu button whatever language it was pressed in). */
export function allLocales(key: TextKey) {
  const entry: Entry = TEXT[key];
  return [entry.uz, entry.ru, entry.en];
}

export function statusText(status: string, locale?: string | null) {
  const group = PUSH_TEXTS[parseLocale(locale)].customerStatus as Record<string, string>;
  return group[status] ?? status.replaceAll("_", " ");
}

export function typeText(type: string, locale?: string | null) {
  const group = PUSH_TEXTS[parseLocale(locale)].type as Record<string, string>;
  return group[type] ?? type;
}

const ROLES: Record<string, Entry> = {
  admin: { uz: "administrator", ru: "администратор", en: "admin" },
  technician: { uz: "texnik", ru: "техник", en: "technician" },
  receptionist: { uz: "qabul operatori", ru: "оператор приёма", en: "front desk" },
  accountant: { uz: "hisobchi", ru: "бухгалтер", en: "accountant" },
  warehouse: { uz: "ombor mudiri", ru: "заведующий складом", en: "warehouse manager" },
};
export function roleText(role: string, locale?: string | null) {
  return ROLES[role]?.[parseLocale(locale)] ?? role;
}
