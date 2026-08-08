"""
Generates a synthetic catalog of 120+ used commercial vehicle listings.
Fields: id, make, model, year, price, km_driven, fuel, payload_kg, gvw_kg,
        body_type, city, papers_verified
Run: python3 generate_catalog.py  ->  writes catalog.csv
"""
import csv
import random

random.seed(42)

MAKES_MODELS = [
    # (make, model, body_type, base_payload_kg, base_gvw_kg)
    ("Tata", "Ace", "mini_truck", 750, 1500),
    ("Tata", "Ace Gold", "mini_truck", 850, 1600),
    ("Tata", "Intra V30", "pickup", 1500, 3200),
    ("Tata", "407", "truck", 2500, 5000),
    ("Tata", "709", "truck", 4500, 8500),
    ("Tata", "1109", "truck", 7000, 11000),
    ("Mahindra", "Bolero Pickup", "pickup", 1600, 3300),
    ("Mahindra", "Jeeto", "mini_truck", 700, 1400),
    ("Mahindra", "Supro", "mini_truck", 900, 1700),
    ("Mahindra", "Furio 7", "truck", 4200, 7500),
    ("Ashok Leyland", "Dost+", "mini_truck", 1250, 2500),
    ("Ashok Leyland", "Partner", "pickup", 1700, 3500),
    ("Ashok Leyland", "Ecomet 1015", "truck", 7200, 11500),
    ("Eicher", "Pro 2049", "truck", 5000, 9000),
    ("Eicher", "Pro 3015", "truck", 9500, 15000),
    ("Force", "Trump 40", "mini_truck", 1000, 2000),
    ("Piaggio", "Porter 700", "mini_truck", 700, 1400),
    ("Maruti Suzuki", "Super Carry", "mini_truck", 740, 1500),
    ("Tata", "LPT 1613", "truck", 9500, 16000),
    ("Bharat Benz", "1214R", "truck", 8000, 12000),
]

FUELS_BY_BODY = {
    "mini_truck": ["diesel", "cng", "petrol"],
    "pickup": ["diesel", "cng"],
    "truck": ["diesel"],
}

CITIES = [
    "Mumbai", "Pune", "Navi Mumbai", "Thane", "Nashik", "Nagpur",
    "Delhi", "Gurgaon", "Noida", "Ahmedabad", "Surat", "Bangalore",
    "Chennai", "Hyderabad", "Kolkata", "Jaipur", "Lucknow", "Indore",
]

PURPOSE_HINTS = ["city_delivery", "long_haul", "intercity", "last_mile", "construction"]


def price_for(base_gvw, year, km):
    # rough depreciation model: newer + lower km = higher price
    age = 2026 - year
    base = 350000 + base_gvw * 55
    depreciation = base * (0.09 * age)
    km_penalty = km * 3.2
    price = max(120000, base - depreciation - km_penalty + random.randint(-25000, 25000))
    return int(round(price, -3))


def main():
    rows = []
    vid = 1
    # Ensure at least 120 listings, spread across makes/models/cities
    while len(rows) < 130:
        make, model, body_type, payload, gvw = random.choice(MAKES_MODELS)
        year = random.randint(2015, 2024)
        km = random.randint(8000, 190000)
        fuel = random.choice(FUELS_BY_BODY[body_type])
        city = random.choice(CITIES)
        papers_verified = random.random() > 0.22
        price = price_for(gvw, year, km)
        # slight payload/gvw variance per listing (wear, trim variants)
        payload_var = int(payload * random.uniform(0.92, 1.05))
        gvw_var = int(gvw * random.uniform(0.95, 1.03))

        rows.append({
            "id": f"V{vid:04d}",
            "make": make,
            "model": model,
            "year": year,
            "price": price,
            "km_driven": km,
            "fuel": fuel,
            "payload_kg": payload_var,
            "gvw_kg": gvw_var,
            "body_type": body_type,
            "city": city,
            "papers_verified": "yes" if papers_verified else "no",
        })
        vid += 1

    # Guarantee coverage: a handful of cheap CNG mini_trucks in Mumbai under 5L
    # (so the assignment's example query always has real matches)
    for _ in range(6):
        make, model, body_type, payload, gvw = random.choice(
            [m for m in MAKES_MODELS if m[2] == "mini_truck"]
        )
        year = random.randint(2019, 2023)
        km = random.randint(15000, 70000)
        rows.append({
            "id": f"V{vid:04d}",
            "make": make,
            "model": model,
            "year": year,
            "price": random.randint(320000, 490000),
            "km_driven": km,
            "fuel": "cng",
            "payload_kg": int(payload * 0.98),
            "gvw_kg": int(gvw * 0.98),
            "body_type": body_type,
            "city": "Mumbai",
            "papers_verified": "yes",
        })
        vid += 1

    with open("catalog.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} listings to catalog.csv")


if __name__ == "__main__":
    main()
