#!/usr/bin/env bash
# Loads the demo data (~150 served customers with sales, repairs, payments, photos and ratings) into the LIVE site, so the
# website and the apps on the phones show a full, working service for a presentation.
#
#   cd ~/Desktop/RIZO/rizo-service-full && ./server/scripts/demo-production.sh
#
# What it asks for is typed hidden and is never saved or printed: the database address (Neon "Connection string",
# the direct one, not "pooled"; it is also the DATABASE_URL on Render) and the sign-in passwords of an admin, a
# receptionist and two technicians (one mobile, one service-centre) that exist on the live site.
# To remove the demo data again:  DATABASE_URL='...' DEMO_CONFIRM=yes npm run demo:clean -w server
set -euo pipefail
cd "$(dirname "$0")/../.."

cat <<'TEXT'
================================================================
 RIZO Service: demo ma'lumotni PRODUCTION'ga yuklash
================================================================
 - 150 ta demo mijoz, ~170 ta so'rov, to'lovlar, ~300 ta rasm va ~100 ta baho qo'shiladi.
 - Haqiqiy ma'lumotlar o'zgarmaydi; demo yozuvlar "DEMO-DATA" belgisi bilan va keyin to'liq o'chiriladi (demo:clean).
 - Yuklash paytida telefonlardagi ilovalarga push xabar bormasligi uchun qurilma tokenlari
   vaqtincha chetga olinadi va oxirida qaytariladi (taxminan 3 daqiqa kutish bor).
 - Render uxlab turgan bo'lsa, boshlanishi 1 daqiqagacha cho'zilishi mumkin; butun jarayon ~10-15 daqiqa.
TEXT
read -r -p "Davom etish uchun HA deb yozing: " answer
[ "$answer" = "HA" ] || { echo "To'xtatildi."; exit 1; }

if [ -z "${API:-}" ]; then read -r -p "API manzili - FAQAT Enter bosing [https://rizo-service-api.onrender.com]: " API; fi
API="${API:-https://rizo-service-api.onrender.com}"
case "$API" in
  postgres://*|postgresql://*) echo; echo "Bu API manzili emas, baza manzili. Ekranda ko'rinib qolgan bo'lishi mumkin: terminalni tozalang (Cmd+K) va qayta ishga tushiring. Bu savolda faqat Enter bosing."; exit 1;;
  http://*|https://*) ;;
  *) echo "API manzili http:// yoki https:// bilan boshlanishi kerak."; exit 1;;
esac
export API
read -r -s -p "Neon DATABASE_URL (ko'rinmaydi): " DATABASE_URL; echo
case "$DATABASE_URL" in postgres://*|postgresql://*) ;; *) echo "DATABASE_URL postgresql:// bilan boshlanishi kerak."; exit 1;; esac
export DATABASE_URL

# 1. wake the server first, so the sign-in checks below are quick and meaningful
echo "Server uyg'otilmoqda ($API) ..."
for attempt in 1 2 3 4 5 6; do
  if curl -fsS -m 60 "$API/api/health" >/dev/null 2>&1; then echo "Server tayyor."; break; fi
  [ "$attempt" = 6 ] && { echo "Server javob bermayapti."; exit 1; }
  sleep 10
done

# 2. every account is checked by a real sign-in before anything is written; a wrong or empty password is asked again
signs_in() { # signs_in phone password -> 0 when the site accepts it
  P="$1" W="$2" python3 -c 'import json,os;print(json.dumps({"phone":os.environ["P"],"password":os.environ["W"]}))' \
    | curl -fsS -m 60 -X POST -H 'Content-Type: application/json' --data-binary @- "$API/api/staff/auth/login" 2>/dev/null | grep -q '"token"'
}
account() { # account PHONEVAR PASSVAR "label" default_phone
  local phone pass tries=0
  while [ "$tries" -lt 3 ]; do
    read -r -p "$3 telefoni [$4]: " phone; phone="${phone:-$4}"
    pass=""
    while [ -z "$pass" ]; do read -r -s -p "$3 paroli (ko'rinmaydi): " pass; echo; [ -n "$pass" ] || echo "  Parol bo'sh bo'lmasligi kerak."; done
    if signs_in "$phone" "$pass"; then printf -v "$1" '%s' "$phone"; printf -v "$2" '%s' "$pass"; echo "  OK: $phone kirdi."; return 0; fi
    echo "  Kirib bo'lmadi (telefon yoki parol noto'g'ri). Qayta urinib ko'ring."; tries=$((tries + 1))
  done
  echo "$3 uchun kirish ishlamadi, to'xtatildi."; exit 1
}
account ADMIN_PHONE ADMIN_PASSWORD "Admin" 998900000001
account DESK_PHONE DESK_PASSWORD "Qabul xodimi (yoki admin)" 998900000005
account MOBILE_PHONE MOBILE_PASSWORD "Mobil texnik" 998900000002
account SHOP_PHONE SHOP_PASSWORD "Servis markazi texnigi" 998900000004
export DEMO_ADMIN="$ADMIN_PHONE:$ADMIN_PASSWORD" DEMO_DESK="$DESK_PHONE:$DESK_PASSWORD" DEMO_TECHS="$MOBILE_PHONE:$MOBILE_PASSWORD,$SHOP_PHONE:$SHOP_PASSWORD"
export DEMO_CONFIRM=yes DEMO_COUNT="${DEMO_COUNT:-150}"

# 3. earlier demo rows (a half-finished run) are removed first, so the load starts from a clean state
echo "Avvalgi demo yozuvlar tekshirilmoqda ..."
npm run demo:clean -w server 2>&1 | grep -E "Demo customers|Removed|error|Error" || true
npm run demo:load -w server
echo
echo "Tayyor. Saytni va ilovalarni yangilang (ilovada pastga tortib yangilash)."
