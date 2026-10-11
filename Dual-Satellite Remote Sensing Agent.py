import os
import random
import requests
from dotenv import load_dotenv
import datetime

# Yeh function automatically tumhari .env file ko dhundhega aur uske secrets ko load karega
load_dotenv()

# Yahan hum os.environ.get() ka use kar rahe hain
COP_CLIENT_ID = os.environ.get("COPERNICUS_CLIENT_ID")
COP_CLIENT_SECRET = os.environ.get("COPERNICUS_CLIENT_SECRET")

# 🔥 API LIMIT SAVER: Ise 'True' rakho testing ke liye. Real API check karne ke liye 'False' kar dena.
TEST_MODE = True

def get_copernicus_token():
    """Copernicus API se access token lene ka function"""
    print("Generating Access Token...")
    url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    data = {
        "client_id": COP_CLIENT_ID,
        "client_secret": COP_CLIENT_SECRET,
        "grant_type": "client_credentials"
    }
    
    try:
        response = requests.post(url, data=data)
        response.raise_for_status()
        token = response.json().get("access_token")
        print("Token successfully generated! ✅")
        return token
    except Exception as e:
        print(f"Error generating token: {e}")
        return None


def check_cloud_cover(lat, lon, token=None, day_offset=0):
    print(f"Checking cloud cover for: Lat {lat}, Lon {lon} (Day -{day_offset})...")
    
    if TEST_MODE:
        cloud_percentage = random.randint(0, 30)
        print(f"[TEST MODE] Simulated Cloud Cover: {cloud_percentage}%")
        return cloud_percentage
    else:
        # REAL API LOGIC: Copernicus Catalog API
        print("[REAL MODE] Fetching live cloud data from Copernicus Catalog...")
        
        # Calculate exactly which date we are checking
        target_date = datetime.datetime.now() - datetime.timedelta(days=day_offset)
        date_str = target_date.strftime('%Y-%m-%d')
        
        # Bounding box (chhota area khet ke aas paas)
        bbox = [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01]
        
        url = "https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        
        payload = {
            "collections": ["sentinel-2-l2a"],
            "datetime": f"{date_str}T00:00:00Z/{date_str}T23:59:59Z",
            "bbox": bbox,
            "limit": 1
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            features = response.json().get("features", [])
            
            if features:
                # Real cloud cover value API se nikali gayi
                real_cloud_cover = features[0]["properties"].get("eo:cloud_cover", 100)
                print(f"-> Real Cloud Cover from API: {real_cloud_cover}%")
                return real_cloud_cover
            else:
                print("-> No satellite pass on this exact day. Assuming cloudy (100%) to trigger Radar.")
                return 100 # Agar us din optical photo nahi hai toh radar use karo
                
        except Exception as e:
            print(f"API Error: {e}. Defaulting to Radar.")
            return 100

# --- STEP 3: REAL Sentinel-1 SAR Fallback Function ---
def fetch_sentinel1_sar(lat, lon, day_offset, token):
    print(f"[RADAR MODE] Fetching Real Sentinel-1 SAR data (Day -{day_offset})...")
    if TEST_MODE:
        return {"vv": -10.5, "vh": -15.2, "rvi": 0.6}
        
    target_date = datetime.datetime.now() - datetime.timedelta(days=day_offset)
    date_str = target_date.strftime('%Y-%m-%d')
    bbox = [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01]
    
    url = "https://sh.dataspace.copernicus.eu/api/v1/statistics"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    evalscript = """
    //VERSION=3
    function setup() { return { input: ["VV", "VH", "dataMask"], output: { bands: 2, sampleType: "FLOAT32" } }; }
    function evaluatePixel(sample) { return [sample.VV, sample.VH]; }
    """
    
    payload = {
        "input": {
            "bounds": {"bbox": bbox},
            "data": [{"type": "sentinel-1-grd", "dataFilter": {"timeRange": {"from": f"{date_str}T00:00:00Z", "to": f"{date_str}T23:59:59Z"}, "polarization": "VVVH"}}]
        },
        "aggregation": {
            "timeRange": {"from": f"{date_str}T00:00:00Z", "to": f"{date_str}T23:59:59Z"},
            "aggregationInterval": {"of": "P1D"},
            "evalscript": evalscript,
            "resx": 10, "resy": 10
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code == 200:
            stats = response.json()
            mean_vv = stats['data'][0]['outputs']['default']['bands']['B0']['stats']['mean']
            mean_vh = stats['data'][0]['outputs']['default']['bands']['B1']['stats']['mean']
            
            # --- FRIEND'S FIX: Convert dB to Linear scale before calculating RVI ---
            lin_vv = 10 ** (mean_vv / 10)
            lin_vh = 10 ** (mean_vh / 10)
            rvi = round(4 * lin_vh / (lin_vv + lin_vh), 2) if (lin_vv + lin_vh) != 0 else 0
            # -----------------------------------------------------------------------
            
            print(f"-> Real SAR Data: VV = {round(mean_vv, 2)} dB, VH = {round(mean_vh, 2)} dB")
            print(f"-> Real Radar Vegetation Index = {rvi}")
            return {"vv": round(mean_vv, 2), "vh": round(mean_vh, 2), "rvi": rvi}
    except Exception as e:
        print(f"-> Radar API Error or No Data on this day.")
    return {"vv": 0.0, "vh": 0.0, "rvi": 0.0}

# --- STEP 4A: REAL Sentinel-2 Optical Data Fetch ---
def fetch_sentinel2_optical(lat, lon, day_offset, token):
    print(f"[OPTICAL MODE] Fetching Real Sentinel-2 NDVI data (Day -{day_offset})...")
    if TEST_MODE:
        return round(random.uniform(0.25, 0.85), 2)
        
    target_date = datetime.datetime.now() - datetime.timedelta(days=day_offset)
    date_str = target_date.strftime('%Y-%m-%d')
    bbox = [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01]
    
    url = "https://sh.dataspace.copernicus.eu/api/v1/statistics"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # JavaScript code jo Copernicus server par NDVI calculate karega
    evalscript = """
    //VERSION=3
    function setup() { return { input: ["B04", "B08", "dataMask"], output: { bands: 1, sampleType: "FLOAT32" } }; }
    function evaluatePixel(sample) {
        let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
        return [ndvi];
    }
    """
    
    payload = {
        "input": {
            "bounds": {"bbox": bbox},
            "data": [{"type": "sentinel-2-l2a", "dataFilter": {"timeRange": {"from": f"{date_str}T00:00:00Z", "to": f"{date_str}T23:59:59Z"}}}]
        },
        "aggregation": {
            "timeRange": {"from": f"{date_str}T00:00:00Z", "to": f"{date_str}T23:59:59Z"},
            "aggregationInterval": {"of": "P1D"},
            "evalscript": evalscript,
            "resx": 10, "resy": 10
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code == 200:
            stats = response.json()
            mean_ndvi = stats['data'][0]['outputs']['default']['bands']['B0']['stats']['mean']
            print(f"-> Real Optical Data Retrieved: NDVI = {round(mean_ndvi, 2)}")
            return round(mean_ndvi, 2)
    except Exception as e:
        print(f"-> Optical API Error or No Data on this day.")
    return 0.0

# --- STEP 4B: 60-90 Day Phenology Engine ---
def analyze_90_day_phenology(lat, lon, token=None):
    print("\n" + "="*50)
    print("--- Starting 90-Day Phenology (Growth Curve) Audit ---")
    print("="*50)
    growth_curve = []

    # Pichle 90 din ka safar: 90 din pehle se shuru karke aaj tak (0) har 15 din par
    for day in range(90, -1, -15):
        print(f"\n[Past Day -{day}]")
        cloud = check_cloud_cover(lat, lon, token, day)

        if cloud > 10:
            print("-> ALERT: Cloud cover > 10%. Switching to Sentinel-1 SAR (Radar).")
            # Yahan day aur token add kiya gaya hai
            sar = fetch_sentinel1_sar(lat, lon, day, token) 
            growth_curve.append({
                "day_offset": f"-{day}d",
                "sensor": "Sentinel-1 SAR",
                "score": sar["rvi"]
            })
        else:
            print("-> CLEAR: Cloud cover <= 10%. Using Sentinel-2 Optical.")
            # Yahan token add kiya gaya hai
            ndvi = fetch_sentinel2_optical(lat, lon, day, token) 
            growth_curve.append({
                "day_offset": f"-{day}d",
                "sensor": "Sentinel-2 Optical",
                "score": ndvi
            })

    print("\n" + "="*50)
    print("--- 90-Day Phenology Curve Complete! ---")
    print(f"Verified Time-Series Records: {growth_curve}")
    print("="*50)
    return growth_curve


def run_agent_2():
    farm_lat, farm_lon = 21.1458, 79.0882  # Nagpur Demo Coordinates

    token = None
    if not TEST_MODE:
        if not COP_CLIENT_ID or not COP_CLIENT_SECRET:
            print("Error: Credentials nahi mile. Kripya check karein ki .env file sahi jagah par hai.")
            return
        token = get_copernicus_token()

    # Ab seedha Step 4 ka 90-day engine call hoga jo apne aap loop mein saara decision lega:
    curve_data = analyze_90_day_phenology(farm_lat, farm_lon, token)

if __name__ == "__main__":
    print("Agent 2 - Setup Initialization Started...\n" + "-"*40)
    run_agent_2()