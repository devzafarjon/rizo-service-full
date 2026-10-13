# RIZO Service: demo ssenariysi (rol bo'yicha)

Taqdimotda hamma ko'rishi mumkin bo'lishi uchun: har rol uchun qadamlar, nimani aytish kerak va qaysi ekranda to'xtash. Umumiy davomiyligi ~25 daqiqa; har rolni alohida ham ko'rsatish mumkin.

## Tayyorgarlik (taqdimotdan oldin)
1. **Serverni uyg'oting:** Render bepul tarifda ~50 soniya uyg'onadi. Taqdimotdan 5 daqiqa oldin saytni oching.
2. **Demo ma'lumotni yangilang** (agar mashq paytida o'zgartirilgan bo'lsa): `./server/scripts/demo-production.sh` avval eski demo yozuvlarni **tozalaydi**, keyin 150 mijoz, ~170 so'rov, to'lovlar, rasmlar, omborlar, brendlar, hisobotlar tarixi va ish haqi ko'chirmalarini qaytadan yuklaydi (~10–15 daqiqa). Bu "demoni qayta boshlash" yo'li. Haqiqiy ma'lumotlarga tegmaydi.
3. **Qurilmalar:** telefon (texnik), planshet (admin), kompyuter (sayt). Ilovalar `~/Desktop/RIZO/apk` (Android) va TestFlight/imzosiz IPA (iPhone). Telefonda kirish, kamera va push ruxsatlari oldindan berilgan bo'lsin.
4. **Telegram:** @rizoservicebot ga mijoz telefoni ulangan bo'lsin; admin Telegram'i ham ulangan (kunlik hisobot keladi).
5. Hisoblar: seed hisoblari (`CLAUDE.md`, "Demo logins"); production'da o'zingizning parollaringiz.

## Hikoya (ketma-ketlik, ~15 daqiqa)
1. **Mijoz Telegram'da so'rov ochadi** (1 daq): botda "Yangi so'rov" → mahsulot → muammo → manzil. Saytda so'rov darrov paydo bo'ladi.
2. **Admin/dispetcher** so'rovni ko'radi, texnikka avtomatik tayinlanganini ko'rsatadi (2 daq).
3. **Texnik (telefon)** ishni oladi: diagnostika, smeta, qism kerak bo'lsa ombor tanlash (4 daq).
4. **Mijoz** smetani tasdiqlaydi (Telegram yoki ilova), texnik ishni yakunlaydi (rasm bilan) (3 daq).
5. **Avtomatik hisobot** egasiga keladi, ish haqi o'zi hisoblanadi (2 daq).
6. **Boshqa brend** so'rovi va navbat qoidasi (3 daq).

## Admin / dispetcher (planshet yoki kompyuter)
- **Doska:** kanban ustunlari, kartani surish, muddat taymeri. *Aytish:* "kechikish ustuni qizarib turadi, hech narsa unutilmaydi".
- **Yangi so'rov:** mijoz → mahsulot ("RIZO mahsuloti" yoki "Boshqa brend") → joy (servis yoki mijoz manzili) → tayinlash (avtomatik / qo'lda). *Aytish:* kafolat sotuvdan o'zi tekshiriladi.
- **So'rov sahifasi:** holat tugmalari, qaror (kafolatli ta'mir, pullik, almashtirish, qaytarish), smeta, to'lov, vaqt chizig'i, mijozga xabar.
- **Avtomatik vazifalar:** to'rtta vazifa, "Hozir ishga tushir" bosing, kunlik hisobot Telegram'ga keladi; muddatga yaqin ishlar; ish haqi ko'chirmalari; hisobotlar tarixi. *Aytish:* "texnik hisobot yozmaydi, egasi hisobotni o'zi oladi".
- **Brendlar va modellar:** tasdiq kutayotgan Midea modeli, tasdiqlash, takrorlarni birlashtirish.
- **Ehtiyot qism buyurtmalari:** tavsiyalar ta'minotchi bo'yicha, kutayotgan ishlar, buyurtmalar, qisman qabul qilish. **Omborlar:** markaziy, hududiy, filial; so'rovlar, jo'natish/qabul qilish.
- **Xodimlar:** texnik, pul ishlash foizi, "Men tuzataman" ro'yxati, 2 bosqichli kirish.
- **Hisobotlar:** foyda, texnik bo'yicha, qonuniy muddat, mijoz fikrlari, ish haqi.

## Qabul operatori
Mijoz qidirish/qo'shish, sotuv yozish (kafolat avtomatik), yangi so'rov, qabul tekshiruvi va imzo, kassa/to'lov, kiosk bilan topshirish, kvitansiya va yorliq chop etish, kalendar va xarita. Hisobotlar, sozlamalar, xodimlar ko'rinmaydi.

## Texnik (telefon)
- **Mening ishlarim:** 4 ustun; "Diagnostikani boshlash", "Pauza" (sabab majburiy), "Yo'ldaman" / "Yetib keldim" (mijoz ETA oladi).
- **Ish sahifasi:** tekshiruv ro'yxati, xizmat va qism qo'shish, **qism kerak bo'lsa ombor tanlash** (qaysi ombor tezroq), rasm, smeta, yakunlash (rasm shart).
- **Boshqa brend ishi:** "Kutilmoqda: avval RIZO va kafolatli ishlaringizni tugating" belgisi.
- **Men tuzataman:** brend/model qo'shish (admin tasdiqlaydi). **Mening zaxiram**, **Mening daromadim** (avtomatik ish haqi ko'chirmasi).
- **Oflayn rejim:** internetni o'chirib ish holatini o'zgartiring, ulanganda yuboriladi.

## Ombor xodimi
Ehtiyot qism buyurtmalari (4 bo'lim), omborlar (qoldiq, minimal, to'ldirish tavsiyasi, tarix), texnik zaxirasi, ta'minotchilar, bildirishnomalar.

## Buxgalter (faqat o'qish)
Hisobotlar (foyda, qarzlar, fiskal chek raqamlari, hamkor markazlar), ish haqi, avtomatik vazifalar sahifasi (o'qish).

## Mijoz (portal, ilova, Telegram)
Mahsulotlarim va kafolat muddati, yangi so'rov, so'rov holati (taymer, texnik, tashrif vaqti, smeta), smetani tasdiqlash, to'lov havolalari, baho va fikr, xizmat markazlari xaritasi. Telegram: menyu, so'rovlar, kafolat, markazlar, xizmatga yozish.

## Nimani aytmaslik / ehtiyot bo'lish
- SMS shlyuzi hali yo'q: parolni tiklash va telefonni qo'lda yozib Telegram'ga ulash kodi faqat server jurnalida chiqadi. Taqdimotda "Raqamimni ulashish" tugmasidan foydalaning.
- To'lov (Payme/Click) hozir faqat havola tugmalari; avtomatik tasdiq spetsifikatsiyada.
- Bu demo: ko'p kompaniyali tizim, pullik hosting va do'kon akkauntlari dasturchilar bosqichida.
