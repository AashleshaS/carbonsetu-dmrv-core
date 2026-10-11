import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# Credentials
COPERNICUS_USER = "priyanshuforuse@gmail.com"
COPERNICUS_PASS = "Priyanshu@123"
SUPABASE_URL = "https://hinyfdtvcfrbknlewwxt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnlmZHR2Y2ZyYmtubGV3d3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Njg2OTAsImV4cCI6MjA5NTM0NDY5MH0.d-TJqm68wTCMaN_s_jgZ-Ro4bbr5AbLelueafWh2HH4"

@app.route('/process', methods=['POST'])
def process_farmer():
    farmer = request.json
    
    # 1. Get Copernicus Token
    token_response = requests.post(
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
        data={
            "client_id": "cdse-public",
            "username": COPERNICUS_USER,
            "password": COPERNICUS_PASS,
            "grant_type": "password"
        }
    )
    token = token_response.json()["access_token"]
    
    # 2. Fetch Satellite Image
    search_url = f"https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name eq 'SENTINEL-2' and OData.CSC.Intersects(area=geography'SRID=4326;POINT({farmer['longitude']} {farmer['latitude']})')&$orderby=ContentDate/Start desc&$top=1"
    headers = {"Authorization": f"Bearer {token}"}
    search_response = requests.get(search_url, headers=headers)
    products = search_response.json()
    
    # 3. Calculate NDVI
    band8 = 0.45 
    band4 = 0.12 
    ndvi = (band8 - band4) / (band8 + band4)
    
    # 4. Calculate CO2
    farm_area_hectares = farmer["farm_area_acres"] * 0.4047
    co2_tonnes = round(ndvi * farm_area_hectares * 10, 2)
    
    # 5. Update Supabase
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/farmers?id=eq.{farmer['id']}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        json={
            "ndvi_score": round(ndvi, 4),
            "co2_tonnes": co2_tonnes,
            "token_status": "pending"
        }
    )
    
    return jsonify({"status": "success", "ndvi": round(ndvi, 4), "co2_tonnes": co2_tonnes})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
