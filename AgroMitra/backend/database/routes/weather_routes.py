from fastapi import APIRouter
from datetime import datetime
import random

router = APIRouter(
    prefix="/api/v1/weather",
    tags=["Weather"]
)


@router.get("/current")
async def current_weather(district: str = "Dhaka"):

    temperature = round(random.uniform(27, 35), 1)
    humidity = random.randint(55, 90)
    wind_speed = random.randint(5, 20)
    rain_probability = random.randint(5, 90)

    if rain_probability > 60:
        condition = "Rainy"
        advice = "Delay fertilizer application."
    elif temperature > 34:
        condition = "Sunny"
        advice = "Water crops early in the morning."
    elif humidity > 80:
        condition = "Humid"
        advice = "High disease risk. Monitor crops."
    else:
        condition = "Cloudy"
        advice = "Good day for farming."

    return {
        "district": district,
        "temperature": temperature,
        "humidity": humidity,
        "wind_speed": wind_speed,
        "rain_probability": rain_probability,
        "condition": condition,
        "advice": advice,
        "updated_at": datetime.now().isoformat()
    }
