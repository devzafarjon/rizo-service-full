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
