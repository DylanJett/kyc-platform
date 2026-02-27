#!/bin/bash

API="http://localhost:8080"

echo "🧹 Clearing database..."
docker exec -it kyc_postgres psql -U kyc_user -d kyc_db -c "TRUNCATE status_history, documents, applications, users RESTART IDENTITY CASCADE;" > /dev/null

echo "👤 Creating reviewer (admin)..."
ADMIN=$(curl -s -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"admin123","full_name":"Admin Reviewer","role":"reviewer"}')
ADMIN_TOKEN=$(echo $ADMIN | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

echo "🏪 Creating 10 merchants..."

# Данные мерчантов
declare -a NAMES=("Ahmed Al Mansouri" "Sara Al Zaabi" "Mohammed Al Rashid" "Fatima Al Hashimi" "Khalid Al Maktoum" "Aisha Al Nuaimi" "Omar Al Qasimi" "Mariam Al Falasi" "Yousef Al Shamsi" "Layla Al Suwaidi")
declare -a EMAILS=("ahmed.mansouri" "sara.zaabi" "mohammed.rashid" "fatima.hashimi" "khalid.maktoum" "aisha.nuaimi" "omar.qasimi" "mariam.falasi" "yousef.shamsi" "layla.suwaidi")
declare -a COMPANIES=("Al Mansouri Trading LLC" "Zaabi Digital Solutions" "Rashid E-Commerce LLC" "Hashimi Retail Group" "Maktoum Ventures LLC" "Nuaimi Fashion Store" "Qasimi Tech Solutions" "Falasi Food & Beverage" "Shamsi Logistics LLC" "Suwaidi Consulting FZ")
declare -a CATEGORIES=("Retail" "Technology" "E-commerce" "Retail" "Finance" "E-commerce" "Technology" "Food & Beverage" "Services" "Finance")
declare -a SUBCATEGORIES=("Clothing" "SaaS" "Online Retail" "Electronics" "Investment" "Marketplace" "IT Services" "Restaurant" "Consulting" "Accounting")
declare -a VOLUMES=("25000" "50000" "75000" "30000" "120000" "45000" "90000" "20000" "60000" "80000")
declare -a PHONES=("+971501234567" "+971521234567" "+971531234567" "+971541234567" "+971551234567" "+971561234567" "+971571234567" "+971581234567" "+971591234567" "+971501234568")
declare -a WEBSITES=("https://almansouri.ae" "https://zaabi.io" "https://rashid-shop.ae" "https://hashimiretail.ae" "https://maktoumventures.ae" "https://nuaimifashion.ae" "https://qasimitech.ae" "https://falsifood.ae" "https://shamsilog.ae" "https://suwaidi-consult.ae")

TOKENS=()

for i in {0..9}; do
  EMAIL="${EMAILS[$i]}@business.ae"
  REG=$(curl -s -X POST "$API/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"merchant123\",\"full_name\":\"${NAMES[$i]}\",\"role\":\"merchant\"}")
  TOKEN=$(echo $REG | grep -o '"token":"[^"]*' | grep -o '[^"]*$')
  TOKENS+=("$TOKEN")

  # Создаём заявку
  curl -s -X POST "$API/api/application" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"business_name\": \"${COMPANIES[$i]}\",
      \"business_category\": \"${CATEGORIES[$i]}\",
      \"business_subcategory\": \"${SUBCATEGORIES[$i]}\",
      \"free_zone\": false,
      \"country\": \"United Arab Emirates\",
      \"website\": \"${WEBSITES[$i]}\",
      \"business_description\": \"A UAE-based company operating in the ${CATEGORIES[$i]} sector, providing high-quality products and services to local and international clients.\",
      \"monthly_volume\": \"${VOLUMES[$i]}\",
      \"owner_name\": \"${NAMES[$i]}\",
      \"contact_phone\": \"${PHONES[$i]}\",
      \"contact_address\": \"Dubai, United Arab Emirates\"
    }" > /dev/null

  # Отправляем на проверку
  curl -s -X POST "$API/api/application/submit" \
    -H "Authorization: Bearer $TOKEN" > /dev/null

  echo "  ✅ Created merchant: ${NAMES[$i]} (${COMPANIES[$i]})"
done

echo ""
echo "📋 Setting application statuses..."

# Получаем список заявок
APPS=$(curl -s "$API/api/applications" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

# Извлекаем ID по порядку
IDS=($(echo $APPS | grep -o '"id":"[^"]*' | grep -o '[^"]*$'))

# 3 отказа (0, 1, 2)
for i in 0 1 2; do
  curl -s -X POST "$API/api/applications/${IDS[$i]}/review" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"status":"rejected","comment":"Application rejected due to incomplete business documentation and insufficient transaction history to meet our compliance requirements."}' > /dev/null
  echo "  ❌ Rejected: ${IDS[$i]}"
done

# 3 одобрены (3, 4, 5)
for i in 3 4 5; do
  curl -s -X POST "$API/api/applications/${IDS[$i]}/review" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"status":"approved","comment":"All documents verified successfully. Application approved."}' > /dev/null
  echo "  ✅ Approved: ${IDS[$i]}"
done

# 1 запрос доп документов (6)
curl -s -X POST "$API/api/applications/${IDS[6]}/review" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"status":"needs_more_docs","comment":"Please provide a clear scan of your passport (all pages including visa stamps). The document should be in PDF or JPG format with minimum resolution of 300 DPI."}' > /dev/null
echo "  📎 Needs more docs: ${IDS[6]}"

# 1 на рассмотрении (7) — оставляем pending, ничего не делаем
echo "  🔄 Pending review: ${IDS[7]}"

# 2 остаются как draft (8, 9) — не отправляем
echo "  📝 Left as draft: ${IDS[8]}, ${IDS[9]}"

echo ""
echo "🎉 Done! Test data created successfully."
echo ""
echo "📌 Credentials:"
echo "   Reviewer: admin / admin123"
echo "   Merchants: ahmed.mansouri@business.ae ... layla.suwaidi@business.ae / merchant123"