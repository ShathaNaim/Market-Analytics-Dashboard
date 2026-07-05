# Precious Metals Market Dashboard

A simple market analytics app for tracking precious metals prices. The project has a Django REST API backend and a Next.js frontend dashboard.

## Features

- View saved Gold and Silver prices
- Compare price performance over the available saved history
- Switch between USD and JOD display values
- Switch price units between ounce and gram
- Generate simple rule-based market insights
- Refresh latest prices from MetalpriceAPI when the free API limit allows it

## Tech Stack

- Backend: Django, Django REST Framework
- Frontend: Next.js, React, TypeScript, Tailwind CSS


## Project Structure

```text
backend/market/   Django API project
frontend/         Next.js frontend app
```


## API Limit Note

Historical ranges are based on saved database prices. If the free MetalpriceAPI limit is reached, refresh may not add new data until the API allowance resets.

<img width="573" height="536" alt="image" src="https://github.com/user-attachments/assets/885baa7b-1da6-4dce-97f6-e0afd92a5a47" />

<img width="573" height="536" alt="image" src="https://github.com/user-attachments/assets/0f0cc78b-fdc8-452c-9fa9-92b9b26cf9b2" />


