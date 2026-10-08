/** Names, places and comments for the demo-data loader (Uzbek). Everything is picked with a seeded random generator, so a run is repeatable. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
export const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
export const chance = (rng: Rng, p: number) => rng() < p;

const MALE = ["Abdulla", "Akmal", "Alisher", "Anvar", "Aziz", "Bahrom", "Bekzod", "Botir", "Davron", "Dilshod", "Doniyor", "Eldor", "Farhod", "Feruz", "G‘ayrat", "Husan", "Ibrohim", "Ilhom", "Islom", "Jahongir", "Jamshid", "Javohir", "Kamol", "Laziz", "Mansur", "Murod", "Nodir", "Otabek", "Rustam", "Sardor", "Sherzod", "Temur", "Ulug‘bek", "Umid", "Zafar", "Sanjar", "Shohruh", "Abbos", "Behzod", "Jasur"];
const FEMALE = ["Aziza", "Dilfuza", "Dilnoza", "Feruza", "Gulnora", "Guzal", "Kamola", "Laylo", "Madina", "Malika", "Munisa", "Nargiza", "Nilufar", "Nodira", "Sevara", "Shahnoza", "Sitora", "Zarina", "Zilola", "Mohira", "Lola", "Barno", "Dildora", "Gulchehra", "Iroda", "Maftuna", "Nasiba", "Ra’no", "Sabina", "Umida"];
const SURNAMES = ["Karimov", "Rahimov", "Yusupov", "Ahmedov", "Tursunov", "Abdullayev", "Ismoilov", "Hasanov", "Nazarov", "Usmonov", "Saidov", "Mirzayev", "Qodirov", "Sobirov", "Toshmatov", "Umarov", "Xolmatov", "Ergashev", "Normatov", "Sultonov", "Rasulov", "Aliyev", "Boboyev", "Davlatov", "Fayzullayev", "Gafurov", "Haydarov", "Jalilov", "Komilov", "Latipov"];

export function fullName(rng: Rng) {
  const female = chance(rng, 0.45);
  const surname = pick(rng, SURNAMES);
  return `${pick(rng, female ? FEMALE : MALE)} ${female ? surname.replace(/(ov|ev)$/, "$1a") : surname}`;
}

export const OPERATORS = ["90", "91", "93", "94", "95", "97", "99", "88", "33", "77"];

type Place = { region: string; city: string; districts: string[]; lat: number; lng: number };
const PLACES: Array<Place & { weight: number }> = [
  { weight: 10, region: "01", city: "Toshkent", districts: ["Chilonzor", "Yunusobod", "Mirzo Ulug‘bek", "Sergeli", "Yakkasaroy", "Shayxontohur", "Olmazor", "Mirobod", "Uchtepa", "Yashnobod"], lat: 41.3, lng: 69.27 },
  { weight: 2, region: "10", city: "Chirchiq", districts: ["Markaz", "Navoiy ko‘chasi", "Sharq"], lat: 41.47, lng: 69.58 },
  { weight: 2, region: "30", city: "Samarqand", districts: ["Registon", "Siyob", "Dahbed", "Universitet xiyoboni"], lat: 39.65, lng: 66.96 },
  { weight: 1, region: "80", city: "Buxoro", districts: ["Markaz", "Mustaqillik", "Navoiy"], lat: 39.77, lng: 64.42 },
  { weight: 1, region: "60", city: "Andijon", districts: ["Markaz", "Bobur shoh", "Shahriston"], lat: 40.78, lng: 72.34 },
  { weight: 1, region: "50", city: "Namangan", districts: ["Markaz", "Davlatobod", "Uychi"], lat: 41.0, lng: 71.67 },
  { weight: 1, region: "40", city: "Farg‘ona", districts: ["Markaz", "Marg‘ilon", "Yangi shahar"], lat: 40.38, lng: 71.78 },
  { weight: 1, region: "85", city: "Navoiy", districts: ["Markaz", "Zarafshon"], lat: 40.1, lng: 65.37 },
];
const STREETS = ["Amir Temur", "Navoiy", "Bobur", "Mustaqillik", "Beruniy", "Fargona yo‘li", "Shota Rustaveli", "Bunyodkor", "Mirzo Ulug‘bek", "Oybek", "Sharof Rashidov", "Qatortol", "Taraqqiyot", "Yangi hayot", "Do‘stlik"];

export function place(rng: Rng) {
  let r = rng() * PLACES.reduce((s, p) => s + p.weight, 0);
  const chosen = PLACES.find((p) => (r -= p.weight) < 0) ?? PLACES[0];
  const address = `${chosen.city}, ${pick(rng, chosen.districts)} tumani, ${pick(rng, STREETS)} ko‘chasi, ${between(rng, 1, 120)}-uy, ${between(rng, 1, 90)}-xonadon`;
  return { region: chosen.region, address, lat: +(chosen.lat + (rng() - 0.5) * 0.08).toFixed(5), lng: +(chosen.lng + (rng() - 0.5) * 0.08).toFixed(5) };
}

export const ISSUES: Record<string, string[]> = {
  fridge: ["Muzlatgich sovutmayapti", "Kompressor shovqin qilyapti", "Pastki bo‘limda suv to‘planyapti", "Eshik zich yopilmayapti", "Muzlatish kamerasi qirov bosgan"],
  ac: ["Konditsioner sovuq havo bermayapti", "Ichki blokdan suv tomyapti", "Yoqilganda xato kodi chiqyapti", "Pult buyruqlariga javob bermayapti", "Tashqi blok g‘alati shovqin qilyapti"],
  tv: ["Ekran yonmayapti, faqat ovoz bor", "Tasvirda vertikal chiziqlar paydo bo‘lgan", "Wi‑Fi'ga ulanmayapti", "Televizor o‘z-o‘zidan o‘chib qolyapti", "Pult ishlamayapti"],
  washer: ["Kir yuvish mashinasi suv tortmayapti", "Siqish vaqtida kuchli titrayapti", "Eshigi ochilmayapti", "Suv chiqib ketmayapti", "Yoqilganda xato kodi chiqyapti"],
};

export const REJECT_REASONS = ["Qurilma mexanik shikastlangan (zarba izlari)", "Noto‘g‘ri ulanish natijasida kuygan, kafolat qamrovida emas", "Qurilma servis markazidan tashqarida ta’mirlangan"];

export const COMMENTS: Record<number, string[]> = {
  5: ["Juda tez va sifatli ishladi, rahmat!", "Texnik aytilgan vaqtda keldi va hammasini tushuntirib berdi.", "Xizmatdan juda mamnunman, tavsiya qilaman.", "Muammo bir kunda hal bo‘ldi.", "Usta xushmuomala va malakali ekan.", "O‘rnatish toza va chiroyli bajarildi.", "Ish tugagach joyni ham yig‘ishtirib ketishdi.", "Qo‘ng‘iroq qilganimdan keyin ertasigayoq kelishdi.", "", "", ""],
  4: ["Yaxshi, lekin biroz kutishga to‘g‘ri keldi.", "Ish sifatli, narxi biroz qimmatroq tuyuldi.", "Hammasi yaxshi, faqat qo‘ng‘iroq kechroq qilishdi.", "Texnik yaxshi ishladi, ammo qism kelishi uzoq cho‘zildi.", "", ""],
  3: ["O‘rtacha. Texnik kechikdi, ish esa yomon emas.", "Narx oldindan aniq aytilmagan edi.", "Ishlayapti, lekin ikkinchi marta kelishga to‘g‘ri keldi.", ""],
  2: ["Texnik kech keldi va ish sifati past.", "Qayta murojaat qilishga to‘g‘ri keldi.", "Narx tushunarsiz edi, hisob-kitob oxirida o‘zgardi."],
  1: ["Muammo hal bo‘lmadi, pul behuda ketdi.", "Texnik qo‘pol muomala qildi.", "Juda uzoq kutdim, hech narsa o‘zgarmadi."],
};
export const HIGH_TAGS = ["fast", "polite", "clean"];
export const LOW_TAGS = ["late", "not_fixed", "rude", "expensive", "unclear_price"];

/** 5 stars most often, a tail of low ratings, like a healthy service. */
export function rating(rng: Rng) {
  const r = rng();
  return r < 0.56 ? 5 : r < 0.82 ? 4 : r < 0.91 ? 3 : r < 0.96 ? 2 : 1;
}

/** Service centres in the regions of Uzbekistan (created once; the phone numbers are placeholders). */
export const DEMO_CENTERS = [
  { name: "RIZO Service — Chilonzor", regionCode: "01", address: "Toshkent shahri, Chilonzor tumani, Bunyodkor ko‘chasi 9", phone: "+998712000001", lat: 41.2755, lng: 69.2035 },
  { name: "RIZO Service — Yunusobod", regionCode: "01", address: "Toshkent shahri, Yunusobod tumani, Amir Temur shoh ko‘chasi 108", phone: "+998712000003", lat: 41.3646, lng: 69.2874 },
  { name: "RIZO Service — Chirchiq", regionCode: "10", address: "Toshkent viloyati, Chirchiq shahri, Navoiy ko‘chasi 24", phone: "+998702000004", lat: 41.4689, lng: 69.5822 },
  { name: "RIZO Service — Guliston", regionCode: "20", address: "Sirdaryo viloyati, Guliston shahri, Mustaqillik ko‘chasi 15", phone: "+998672000005", lat: 40.4897, lng: 68.7842 },
  { name: "RIZO Service — Jizzax", regionCode: "25", address: "Jizzax viloyati, Jizzax shahri, Sharof Rashidov ko‘chasi 40", phone: "+998722000006", lat: 40.1158, lng: 67.8422 },
  { name: "RIZO Service — Samarqand", regionCode: "30", address: "Samarqand viloyati, Samarqand shahri, Registon ko‘chasi 12", phone: "+998662000002", lat: 39.6542, lng: 66.9597 },
  { name: "RIZO Service — Farg‘ona", regionCode: "40", address: "Farg‘ona viloyati, Farg‘ona shahri, Al-Farg‘oniy ko‘chasi 33", phone: "+998732000007", lat: 40.3864, lng: 71.7864 },
  { name: "RIZO Service — Namangan", regionCode: "50", address: "Namangan viloyati, Namangan shahri, Uychi ko‘chasi 6", phone: "+998692000008", lat: 40.9983, lng: 71.6726 },
  { name: "RIZO Service — Andijon", regionCode: "60", address: "Andijon viloyati, Andijon shahri, Bobur shoh ko‘chasi 71", phone: "+998742000009", lat: 40.7821, lng: 72.3442 },
  { name: "RIZO Service — Qarshi", regionCode: "70", address: "Qashqadaryo viloyati, Qarshi shahri, Islom Karimov ko‘chasi 52", phone: "+998752000010", lat: 38.8606, lng: 65.7891 },
  { name: "RIZO Service — Termiz", regionCode: "75", address: "Surxondaryo viloyati, Termiz shahri, Al-Termiziy ko‘chasi 18", phone: "+998762000011", lat: 37.2242, lng: 67.2783 },
  { name: "RIZO Service — Buxoro", regionCode: "80", address: "Buxoro viloyati, Buxoro shahri, Mustaqillik ko‘chasi 29", phone: "+998652000012", lat: 39.7747, lng: 64.4286 },
  { name: "RIZO Service — Navoiy", regionCode: "85", address: "Navoiy viloyati, Navoiy shahri, Galaba ko‘chasi 14", phone: "+998792000013", lat: 40.0844, lng: 65.3792 },
  { name: "RIZO Service — Urganch", regionCode: "90", address: "Xorazm viloyati, Urganch shahri, Al-Xorazmiy ko‘chasi 47", phone: "+998622000014", lat: 41.5506, lng: 60.6317 },
  { name: "RIZO Service — Nukus", regionCode: "95", address: "Qoraqalpog‘iston Respublikasi, Nukus shahri, Berdaq ko‘chasi 22", phone: "+998612000015", lat: 42.4531, lng: 59.6103 },
];
